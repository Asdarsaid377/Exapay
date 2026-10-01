import { employees, employeeSalaries, employeeSalaryItems, payrollRuns, salaryComponents, tenants, users } from "@exapay/db";
import {
  BPJS_PROGRAMS,
  type BpjsProgram,
  type EmployeeSalaryItem,
  type EmployeeSalaryOverview,
  type EmployeeSalaryVersion,
  type SaveEmployeeSalaryData,
} from "@exapay/shared";
import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { Decimal } from "decimal.js";
import { asc, desc, eq, gte, inArray, isNull } from "drizzle-orm";

import { type AuthUser, tenantContextOf } from "../../common/auth/auth-user.js";
import { DRIZZLE } from "../../database/database.module.js";
import { exclusionViolationConstraint } from "../../database/errors.js";
import { type Database, type TenantContext, type Transaction, withTenant } from "../../database/tenant-transaction.js";
import { localClock } from "../attendance/attendance-clock.js";
import { previousDate, versionStatus } from "../attendance/attendance-deduction-rules.js";
import { AttendanceService } from "../attendance/attendance.service.js";
import { AuditService } from "../audit/audit.service.js";
import { formatIdDate, formatIdMonth } from "./payroll-draft.js";
import { requireSalaryManager } from "./salary-access.js";
import { toJkkRiskLevel } from "./salary-components.service.js";

const ENTITY = "employee_salary";

const versionColumns = {
  id: employeeSalaries.id,
  effectiveFrom: employeeSalaries.effectiveFrom,
  effectiveTo: employeeSalaries.effectiveTo,
  bpjsKesehatan: employeeSalaries.bpjsKesehatan,
  bpjsJht: employeeSalaries.bpjsJht,
  bpjsJp: employeeSalaries.bpjsJp,
  bpjsJkk: employeeSalaries.bpjsJkk,
  bpjsJkm: employeeSalaries.bpjsJkm,
  note: employeeSalaries.note,
  createdByName: employeeSalaries.createdByName,
  createdAt: employeeSalaries.createdAt,
};
type VersionRow = {
  id: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  bpjsKesehatan: boolean;
  bpjsJht: boolean;
  bpjsJp: boolean;
  bpjsJkk: boolean;
  bpjsJkm: boolean;
  note: string | null;
  createdByName: string | null;
  createdAt: Date;
};

type BpjsColumns = Pick<VersionRow, "bpjsKesehatan" | "bpjsJht" | "bpjsJp" | "bpjsJkk" | "bpjsJkm">;

function bpjsToColumns(programs: readonly BpjsProgram[]): BpjsColumns {
  return {
    bpjsKesehatan: programs.includes("kesehatan"),
    bpjsJht: programs.includes("jht"),
    bpjsJp: programs.includes("jp"),
    bpjsJkk: programs.includes("jkk"),
    bpjsJkm: programs.includes("jkm"),
  };
}

// Urutan BPJS_PROGRAMS
function columnsToBpjs(row: BpjsColumns): BpjsProgram[] {
  const joined: Record<BpjsProgram, boolean> = { kesehatan: row.bpjsKesehatan, jht: row.bpjsJht, jp: row.bpjsJp, jkk: row.bpjsJkk, jkm: row.bpjsJkm };
  return BPJS_PROGRAMS.filter((program) => joined[program]);
}

// Jumlah nominal tercatat (bukan perhitungan gaji — itu di payroll-engine): pendapatan = semua jenis selain potongan
function totals(items: readonly EmployeeSalaryItem[]): { earningsTotal: string; deductionsTotal: string } {
  let earnings = new Decimal(0);
  let deductions = new Decimal(0);
  for (const item of items) {
    if (item.kind === "deduction") deductions = deductions.plus(item.amount);
    else earnings = earnings.plus(item.amount);
  }
  return { earningsTotal: earnings.toFixed(2), deductionsTotal: deductions.toFixed(2) };
}

function toVersion(row: VersionRow, items: EmployeeSalaryItem[], today: string): EmployeeSalaryVersion {
  return {
    id: row.id,
    effectiveFrom: row.effectiveFrom,
    effectiveTo: row.effectiveTo,
    status: versionStatus(row.effectiveFrom, row.effectiveTo, today),
    items,
    ...totals(items),
    bpjsPrograms: columnsToBpjs(row),
    note: row.note,
    createdByName: row.createdByName,
    createdAt: row.createdAt.toISOString(),
  };
}

// Gaji karyawan berlaku-tanggal (feature 28, tab Gaji /employees/[id]) — owner/admin.
// Simpan = versi baru mulai `effectiveFrom` (≥ tanggal masuk, boleh mundur — keputusan user). Versi yang berjalan pada
// tanggal itu ditutup sehari sebelumnya; versi yang mulai pada/sesudah tanggal itu tergantikan → dihapus (diaudit).
// Feature 30: tanggal berlaku tidak boleh masuk/sebelum periode payroll yang sudah final (snapshot tidak berubah, tapi
// riwayat gaji harus cocok dengan payroll yang dibayar) — koreksi lewat penyesuaian periode berikutnya.
@Injectable()
export class EmployeeSalariesService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly attendance: AttendanceService,
    private readonly audit: AuditService,
  ) {}

  async overview(user: AuthUser, employeeId: string): Promise<EmployeeSalaryOverview> {
    const ctx = tenantContextOf(user);
    return withTenant(this.db, ctx, async (tx) => {
      await requireSalaryManager(tx, ctx);
      const employee = await this.findEmployee(tx, employeeId);
      return this.loadOverview(tx, ctx, employee);
    });
  }

  async save(user: AuthUser, employeeId: string, input: SaveEmployeeSalaryData): Promise<EmployeeSalaryOverview> {
    const ctx = tenantContextOf(user);
    try {
      return await withTenant(this.db, ctx, async (tx) => {
        await requireSalaryManager(tx, ctx);
        const employee = await this.findEmployee(tx, employeeId);
        if (input.effectiveFrom < employee.joinDate) throw new BadRequestException("Tanggal berlaku tidak boleh sebelum tanggal masuk karyawan");
        if (employee.endDate !== null && input.effectiveFrom > employee.endDate) {
          throw new BadRequestException("Tanggal berlaku tidak boleh setelah tanggal keluar karyawan");
        }
        // FOR SHARE periode bulan ini & sesudahnya: bergantian dengan finalisasi (FOR UPDATE) — finalisasi yang menunggu
        // membaca versi gaji ini, atau simpan ini melihat periode yang baru final
        const laterRuns = await tx
          .select({ periodMonth: payrollRuns.periodMonth, status: payrollRuns.status, periodEnd: payrollRuns.periodEnd })
          .from(payrollRuns)
          .where(gte(payrollRuns.periodMonth, `${input.effectiveFrom.slice(0, 7)}-01`))
          .orderBy(desc(payrollRuns.periodMonth))
          .for("share");
        // Periode final (bulan ini atau sesudahnya) yang rentang absensinya (tutup buku) sampai tanggal berlaku ini atau lebih
        const lastFinal = laterRuns.find((run) => run.status === "final" && run.periodEnd !== null && run.periodEnd >= input.effectiveFrom);
        if (lastFinal?.periodEnd) {
          const to = lastFinal.periodEnd;
          throw new BadRequestException(
            `Payroll ${formatIdMonth(lastFinal.periodMonth.slice(0, 7))} sudah final — tanggal berlaku harus setelah ${formatIdDate(to)}. Koreksi gaji periode final lewat penyesuaian periode berikutnya.`,
          );
        }

        // FOR SHARE: jenis/arsip komponen tidak berubah sampai versi ini tersimpan (bergantian dengan ubah komponen)
        const components = await tx
          .select({ id: salaryComponents.id, name: salaryComponents.name, kind: salaryComponents.kind, archivedAt: salaryComponents.archivedAt })
          .from(salaryComponents)
          .where(
            inArray(
              salaryComponents.id,
              input.items.map((item) => item.componentId),
            ),
          )
          .for("share");
        const componentById = new Map(components.map((component) => [component.id, component]));
        const items = input.items.map((item) => {
          const component = componentById.get(item.componentId);
          if (!component) throw new BadRequestException("Komponen gaji tidak ditemukan. Muat ulang halaman lalu coba lagi.");
          if (component.archivedAt) throw new BadRequestException(`Komponen "${component.name}" sudah diarsipkan`);
          return { ...item, name: component.name, kind: component.kind };
        });
        if (items.filter((item) => item.kind === "base_salary").length !== 1) throw new BadRequestException("Gaji pokok wajib diisi");
        if (items.filter((item) => item.kind === "attendance_allowance").length > 1) {
          throw new BadRequestException("Tunjangan kehadiran paling banyak satu");
        }

        // Kunci versi karyawan ini — dua penyimpanan bersamaan diproses bergantian
        const existing = await this.selectVersions(tx, employee.id, true);
        const replaced = existing.filter((version) => version.effectiveFrom >= input.effectiveFrom);
        if (replaced.length > 0) {
          const replacedItems = await this.selectItems(
            tx,
            replaced.map((version) => version.id),
          );
          for (const row of replaced) {
            await tx.delete(employeeSalaries).where(eq(employeeSalaries.id, row.id));
            await this.audit.record(tx, ctx, {
              entity: ENTITY,
              entityId: row.id,
              action: "delete",
              before: { employeeId: employee.id, ...this.snapshot(row, replacedItems.get(row.id) ?? []) },
            });
          }
        }
        const running = existing.find(
          (version) => version.effectiveFrom < input.effectiveFrom && (version.effectiveTo === null || version.effectiveTo >= input.effectiveFrom),
        );
        if (running) {
          const effectiveTo = previousDate(input.effectiveFrom);
          await tx.update(employeeSalaries).set({ effectiveTo }).where(eq(employeeSalaries.id, running.id));
          await this.audit.record(tx, ctx, {
            entity: ENTITY,
            entityId: running.id,
            action: "close",
            before: { employeeId: employee.id, effectiveTo: running.effectiveTo },
            after: { employeeId: employee.id, effectiveTo },
          });
        }
        const [actor] = await tx.select({ fullName: users.fullName }).from(users).where(eq(users.id, user.userId));
        const [created] = await tx
          .insert(employeeSalaries)
          .values({
            tenantId: ctx.tenantId,
            employeeId: employee.id,
            effectiveFrom: input.effectiveFrom,
            effectiveTo: null,
            ...bpjsToColumns(input.bpjsPrograms),
            note: input.note,
            createdByUserId: user.userId,
            createdByName: actor?.fullName ?? null,
          })
          .returning({ id: employeeSalaries.id });
        if (!created) throw new Error("[employee-salaries/save] insert tidak mengembalikan baris");
        await tx
          .insert(employeeSalaryItems)
          .values(items.map((item) => ({ tenantId: ctx.tenantId, salaryId: created.id, componentId: item.componentId, amount: item.amount })));
        await this.audit.record(tx, ctx, {
          entity: ENTITY,
          entityId: created.id,
          action: "create",
          after: {
            employeeId: employee.id,
            effectiveFrom: input.effectiveFrom,
            items: items.map((item) => ({ name: item.name, kind: item.kind, amount: item.amount })),
            bpjsPrograms: input.bpjsPrograms,
            note: input.note,
          },
        });

        return this.loadOverview(tx, ctx, employee);
      });
    } catch (error) {
      // Seharusnya tidak terjadi (versi dikunci) — jaga-jaga dari penyimpanan pertama yang bersamaan
      if (exclusionViolationConstraint(error) === "employee_salaries_no_overlap") {
        throw new ConflictException("Gaji karyawan ini baru saja diubah pengguna lain. Muat ulang halaman lalu coba lagi.");
      }
      throw error;
    }
  }

  // ——— helper ———

  private async findEmployee(tx: Transaction, id: string): Promise<{ id: string; joinDate: string; endDate: string | null }> {
    const [employee] = await tx
      .select({ id: employees.id, joinDate: employees.joinDate, endDate: employees.endDate })
      .from(employees)
      .where(eq(employees.id, id));
    if (!employee) throw new NotFoundException("Karyawan tidak ditemukan");
    return employee;
  }

  private async loadOverview(tx: Transaction, ctx: TenantContext, employee: { id: string; joinDate: string }): Promise<EmployeeSalaryOverview> {
    const today = localClock(new Date(), await this.attendance.tenantTimeZone(tx, ctx.tenantId)).date;
    const [tenant] = await tx.select({ jkkRiskLevel: tenants.jkkRiskLevel }).from(tenants).where(eq(tenants.id, ctx.tenantId));
    if (!tenant) throw new NotFoundException("Usaha tidak ditemukan");
    const components = await tx
      .select({ id: salaryComponents.id, name: salaryComponents.name, kind: salaryComponents.kind })
      .from(salaryComponents)
      .where(isNull(salaryComponents.archivedAt))
      .orderBy(asc(salaryComponents.sortOrder), asc(salaryComponents.name));
    const rows = await this.selectVersions(tx, employee.id);
    const items = await this.selectItems(
      tx,
      rows.map((row) => row.id),
    );
    return {
      today,
      joinDate: employee.joinDate,
      jkkRiskLevel: toJkkRiskLevel(tenant.jkkRiskLevel),
      components,
      versions: rows.map((row) => toVersion(row, items.get(row.id) ?? [], today)),
    };
  }

  // Terbaru di atas. `lock` = FOR UPDATE (penyimpanan versi baru)
  private selectVersions(tx: Transaction, employeeId: string, lock = false): Promise<VersionRow[]> {
    const query = tx.select(versionColumns).from(employeeSalaries).where(eq(employeeSalaries.employeeId, employeeId)).orderBy(desc(employeeSalaries.effectiveFrom));
    return lock ? query.for("update") : query;
  }

  // Item per versi, urutan katalog komponen
  private async selectItems(tx: Transaction, salaryIds: readonly string[]): Promise<Map<string, EmployeeSalaryItem[]>> {
    const bySalary = new Map<string, EmployeeSalaryItem[]>();
    if (salaryIds.length === 0) return bySalary;
    const rows = await tx
      .select({
        salaryId: employeeSalaryItems.salaryId,
        componentId: employeeSalaryItems.componentId,
        name: salaryComponents.name,
        kind: salaryComponents.kind,
        amount: employeeSalaryItems.amount,
      })
      .from(employeeSalaryItems)
      .innerJoin(salaryComponents, eq(salaryComponents.id, employeeSalaryItems.componentId))
      .where(inArray(employeeSalaryItems.salaryId, [...salaryIds]))
      .orderBy(asc(salaryComponents.sortOrder), asc(salaryComponents.name));
    for (const { salaryId, ...item } of rows) {
      const list = bySalary.get(salaryId) ?? [];
      list.push(item);
      bySalary.set(salaryId, list);
    }
    return bySalary;
  }

  // Isi versi untuk audit log
  private snapshot(row: VersionRow, items: readonly EmployeeSalaryItem[]): Record<string, unknown> {
    return {
      effectiveFrom: row.effectiveFrom,
      effectiveTo: row.effectiveTo,
      items: items.map((item) => ({ name: item.name, kind: item.kind, amount: item.amount })),
      bpjsPrograms: columnsToBpjs(row),
      note: row.note,
    };
  }
}

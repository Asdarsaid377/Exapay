import { attendanceDeductionRules, attendanceRecords, employees, leaveRequests, positions, users } from "@exapay/db";
import { calculateAttendanceDeduction } from "@exapay/payroll-engine";
import type {
  AttendanceDeductionFacts,
  AttendanceDeductionPreview,
  AttendanceDeductionPreviewInput,
  AttendanceDeductionRuleVersion,
  AttendanceDeductionSettings,
  LeaveType,
  SaveAttendanceDeductionRulesInput,
} from "@exapay/shared";
import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, asc, between, desc, eq, gte, inArray, lte } from "drizzle-orm";

import { type AuthUser, tenantContextOf } from "../../common/auth/auth-user.js";
import { DRIZZLE } from "../../database/database.module.js";
import { exclusionViolationConstraint } from "../../database/errors.js";
import { type Database, type TenantContext, type Transaction, withTenant } from "../../database/tenant-transaction.js";
import { AuditService } from "../audit/audit.service.js";
import { localClock } from "./attendance-clock.js";
import { type DeductionLeave, deductionFacts } from "./attendance-deduction-facts.js";
import {
  columnsToRules,
  type PeriodRules,
  previousDate,
  type RuleColumns,
  rulesForPeriod,
  rulesToColumns,
  versionStatus,
} from "./attendance-deduction-rules.js";
import { AttendancePeriodsService } from "./attendance-periods.service.js";
import { type RecapEmployment, recapEmployee } from "./attendance-recap.js";
import { loadAttendanceViewer } from "./attendance-viewer.js";
import { AttendanceService } from "./attendance.service.js";
import { countPlannedWorkingDays } from "./work-calendar.js";
import { WorkCalendarService } from "./work-calendar.service.js";

const ENTITY = "attendance_deduction_rule";

const versionColumns = {
  id: attendanceDeductionRules.id,
  effectiveFrom: attendanceDeductionRules.effectiveFrom,
  effectiveTo: attendanceDeductionRules.effectiveTo,
  absenceMode: attendanceDeductionRules.absenceMode,
  absenceProrateBase: attendanceDeductionRules.absenceProrateBase,
  absenceDivisorMode: attendanceDeductionRules.absenceDivisorMode,
  absenceDivisorDays: attendanceDeductionRules.absenceDivisorDays,
  absenceAmountPerDay: attendanceDeductionRules.absenceAmountPerDay,
  lateMode: attendanceDeductionRules.lateMode,
  lateToleranceMinutes: attendanceDeductionRules.lateToleranceMinutes,
  lateBlockMinutes: attendanceDeductionRules.lateBlockMinutes,
  lateAmount: attendanceDeductionRules.lateAmount,
  lateMonthlyCap: attendanceDeductionRules.lateMonthlyCap,
  permitSickMode: attendanceDeductionRules.permitSickMode,
  permitSickFreeDays: attendanceDeductionRules.permitSickFreeDays,
  allowanceMode: attendanceDeductionRules.allowanceMode,
  allowanceMinAbsentDays: attendanceDeductionRules.allowanceMinAbsentDays,
  allowanceAmountPerDay: attendanceDeductionRules.allowanceAmountPerDay,
  createdByName: attendanceDeductionRules.createdByName,
  createdAt: attendanceDeductionRules.createdAt,
};

type VersionRow = RuleColumns & {
  id: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  createdByName: string | null;
  createdAt: Date;
};

function toVersion(row: VersionRow, today: string): AttendanceDeductionRuleVersion {
  return {
    id: row.id,
    effectiveFrom: row.effectiveFrom,
    effectiveTo: row.effectiveTo,
    status: versionStatus(row.effectiveFrom, row.effectiveTo, today),
    rules: columnsToRules(row),
    createdByName: row.createdByName,
    createdAt: row.createdAt.toISOString(),
  };
}

// Aturan potongan absensi (feature 17): versi aturan per usaha + pratinjau untuk satu karyawan.
// Owner/admin saja (peran dibaca ulang dari DB). Perhitungan di payroll-engine, bukan di sini.
// periodRules/periodFacts/periodFactsMany menyiapkan input absensi calculatePayroll untuk payroll (feature 27, dipakai feature 29).
@Injectable()
export class AttendanceDeductionRulesService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly attendance: AttendanceService,
    private readonly workCalendar: WorkCalendarService,
    private readonly audit: AuditService,
    private readonly periods: AttendancePeriodsService,
  ) {}

  async settings(user: AuthUser): Promise<AttendanceDeductionSettings> {
    const ctx = tenantContextOf(user);
    return withTenant(this.db, ctx, async (tx) => {
      await this.requireManager(tx, ctx);
      const today = await this.today(tx, ctx);
      const rows = await this.selectVersions(tx);
      return { today, versions: rows.map((row) => toVersion(row, today)) };
    });
  }

  // Simpan = versi baru mulai `effectiveFrom` (≥ hari ini). Versi yang berjalan ditutup sehari sebelumnya; versi
  // terjadwal yang mulai pada/sesudah tanggal itu belum pernah berlaku → dihapus (tercatat di audit log).
  async save(user: AuthUser, input: SaveAttendanceDeductionRulesInput): Promise<AttendanceDeductionSettings> {
    const ctx = tenantContextOf(user);
    try {
      return await withTenant(this.db, ctx, async (tx) => {
        await this.requireManager(tx, ctx);
        const today = await this.today(tx, ctx);
        if (input.effectiveFrom < today) throw new BadRequestException("Tanggal berlaku tidak boleh sebelum hari ini");

        // Kunci semua versi usaha ini — dua penyimpanan bersamaan diproses bergantian
        const existing = await this.selectVersions(tx, true);
        for (const row of existing.filter((version) => version.effectiveFrom >= input.effectiveFrom)) {
          await tx.delete(attendanceDeductionRules).where(eq(attendanceDeductionRules.id, row.id));
          await this.audit.record(tx, ctx, {
            entity: ENTITY,
            entityId: row.id,
            action: "delete",
            before: { effectiveFrom: row.effectiveFrom, effectiveTo: row.effectiveTo, rules: columnsToRules(row) },
          });
        }
        const running = existing.find(
          (version) => version.effectiveFrom < input.effectiveFrom && (version.effectiveTo === null || version.effectiveTo >= input.effectiveFrom),
        );
        if (running) {
          const effectiveTo = previousDate(input.effectiveFrom);
          await tx.update(attendanceDeductionRules).set({ effectiveTo }).where(eq(attendanceDeductionRules.id, running.id));
          await this.audit.record(tx, ctx, {
            entity: ENTITY,
            entityId: running.id,
            action: "close",
            before: { effectiveTo: running.effectiveTo },
            after: { effectiveTo },
          });
        }

        const [actor] = await tx.select({ fullName: users.fullName }).from(users).where(eq(users.id, user.userId));
        const [created] = await tx
          .insert(attendanceDeductionRules)
          .values({
            tenantId: ctx.tenantId,
            effectiveFrom: input.effectiveFrom,
            effectiveTo: null,
            ...rulesToColumns(input.rules),
            createdByUserId: user.userId,
            createdByName: actor?.fullName ?? null,
          })
          .returning({ id: attendanceDeductionRules.id });
        if (!created) throw new Error("[attendance-deduction/save] insert tidak mengembalikan baris");
        await this.audit.record(tx, ctx, {
          entity: ENTITY,
          entityId: created.id,
          action: "create",
          after: { effectiveFrom: input.effectiveFrom, rules: input.rules },
        });

        const rows = await this.selectVersions(tx);
        return { today, versions: rows.map((row) => toVersion(row, today)) };
      });
    } catch (error) {
      // Seharusnya tidak terjadi (versi dikunci) — jaga-jaga dari penyimpanan bersamaan yang lolos
      if (exclusionViolationConstraint(error) === "attendance_deduction_rules_no_overlap") {
        throw new ConflictException("Aturan baru saja diubah pengguna lain. Muat ulang halaman lalu coba lagi.");
      }
      throw error;
    }
  }

  // Pratinjau: rekap absensi nyata karyawan di periode payroll bulan terpilih + gaji isian (belum ada komponen gaji — feature 28).
  // Aturan dari form (belum tentu disimpan) agar admin bisa mencoba sebelum menyimpan.
  async preview(user: AuthUser, input: AttendanceDeductionPreviewInput): Promise<AttendanceDeductionPreview> {
    const ctx = tenantContextOf(user);
    return withTenant(this.db, ctx, async (tx) => {
      await this.requireManager(tx, ctx);
      const [employee] = await tx
        .select({ id: employees.id, fullName: employees.fullName, positionName: positions.name, joinDate: employees.joinDate, endDate: employees.endDate })
        .from(employees)
        .innerJoin(positions, eq(positions.id, employees.positionId))
        .where(eq(employees.id, input.employeeId));
      if (!employee) throw new NotFoundException("Karyawan tidak ditemukan");

      const today = await this.today(tx, ctx);
      // Periode tutup buku payroll bulan itu (feature 30b) — sama dengan draf payroll
      const { from, to } = await this.periods.payrollPeriod(tx, ctx, input.month);
      const period = { from, to };
      const facts = await this.periodFacts(tx, employee, period.from, period.to, today);
      const result = calculateAttendanceDeduction({
        rules: input.rules,
        salary: { baseSalary: input.baseSalary, fixedAllowances: input.fixedAllowances, attendanceAllowance: input.attendanceAllowance },
        facts,
      });
      return { employee: { id: employee.id, fullName: employee.fullName, positionName: employee.positionName }, ...period, today, facts, result };
    });
  }

  // ——— input payroll (dipanggil di dalam transaksi tenant pemanggil) ———

  // Versi aturan yang berlaku di hari pertama periode + tanggal versi baru yang mulai di tengah periode (untuk peringatan)
  async periodRules(tx: Transaction, from: string, to: string): Promise<PeriodRules> {
    const rows = await this.selectVersions(tx);
    return rulesForPeriod(
      rows.map((row) => ({ effectiveFrom: row.effectiveFrom, effectiveTo: row.effectiveTo, rules: columnsToRules(row) })),
      from,
      to,
    );
  }

  // Fakta absensi satu karyawan dalam periode dari rekap; `today` (zona waktu usaha) = batas hari alpa
  async periodFacts(
    tx: Transaction,
    employee: RecapEmployment & { id: string },
    from: string,
    to: string,
    today: string,
  ): Promise<AttendanceDeductionFacts> {
    const facts = (await this.periodFactsMany(tx, [employee], from, to, today)).get(employee.id);
    if (!facts) throw new Error("[attendance-deduction/periodFacts] fakta karyawan tidak terbentuk");
    return facts;
  }

  // Fakta absensi banyak karyawan sekaligus (draf payroll feature 29): kalender dimuat sekali, absensi & izin satu query
  async periodFactsMany(
    tx: Transaction,
    employeeList: readonly (RecapEmployment & { id: string })[],
    from: string,
    to: string,
    today: string,
  ): Promise<Map<string, AttendanceDeductionFacts>> {
    const result = new Map<string, AttendanceDeductionFacts>();
    if (employeeList.length === 0) return result;
    const ids = employeeList.map((employee) => employee.id);
    const calendar = await this.workCalendar.loadCalendar(tx, from, to);
    // Mode shift (feature 47): hari kerja = hari ber-shift di roster, pembagi = perkiraan hari kerja periode per karyawan
    const calendars = await this.workCalendar.employeeCalendars(tx, calendar, ids, from, to);
    const recordRows = await tx
      .select({
        employeeId: attendanceRecords.employeeId,
        workDate: attendanceRecords.workDate,
        lateMinutes: attendanceRecords.lateMinutes,
        checkOutAt: attendanceRecords.checkOutAt,
      })
      .from(attendanceRecords)
      .where(and(inArray(attendanceRecords.employeeId, ids), between(attendanceRecords.workDate, from, to)));
    const leaveRows = await this.selectApprovedLeaves(tx, ids, from, to);

    for (const employee of employeeList) {
      const records = recordRows
        .filter((row) => row.employeeId === employee.id)
        .map((row) => ({ workDate: row.workDate, lateMinutes: row.lateMinutes, hasCheckOut: row.checkOutAt !== null }));
      const leaves = leaveRows.filter((row) => row.employeeId === employee.id);
      const employment = { joinDate: employee.joinDate, endDate: employee.endDate };
      const own = calendars.get(employee.id) ?? calendar;
      const recap = recapEmployee({ calendar: own, from, to, today, employment, records, leaves });
      result.set(employee.id, deductionFacts({ days: recap.days, records, leaves, periodWorkingDays: countPlannedWorkingDays(own, from, to) }));
    }
    return result;
  }

  // ——— helper ———

  private async requireManager(tx: Transaction, ctx: TenantContext): Promise<void> {
    const viewer = await loadAttendanceViewer(tx, ctx);
    if (!viewer?.manage) throw new ForbiddenException("Hanya pemilik atau admin yang dapat mengatur potongan absensi");
  }

  private async today(tx: Transaction, ctx: TenantContext): Promise<string> {
    return localClock(new Date(), await this.attendance.tenantTimeZone(tx, ctx.tenantId)).date;
  }

  // Terbaru di atas. `lock` = FOR UPDATE (penyimpanan versi baru)
  private selectVersions(tx: Transaction, lock = false): Promise<VersionRow[]> {
    const query = tx.select(versionColumns).from(attendanceDeductionRules).orderBy(desc(attendanceDeductionRules.effectiveFrom));
    return lock ? query.for("update") : query;
  }

  private async selectApprovedLeaves(
    tx: Transaction,
    employeeIds: readonly string[],
    from: string,
    to: string,
  ): Promise<(DeductionLeave & { employeeId: string })[]> {
    const rows: { employeeId: string; type: LeaveType; startDate: string; endDate: string; attachmentKey: string | null }[] = await tx
      .select({
        employeeId: leaveRequests.employeeId,
        type: leaveRequests.type,
        startDate: leaveRequests.startDate,
        endDate: leaveRequests.endDate,
        attachmentKey: leaveRequests.attachmentKey,
      })
      .from(leaveRequests)
      .where(
        and(
          inArray(leaveRequests.employeeId, [...employeeIds]),
          eq(leaveRequests.status, "approved"),
          lte(leaveRequests.startDate, to),
          gte(leaveRequests.endDate, from),
        ),
      )
      .orderBy(asc(leaveRequests.startDate));
    return rows.map((row) => ({
      employeeId: row.employeeId,
      type: row.type,
      startDate: row.startDate,
      endDate: row.endDate,
      hasDocument: row.attachmentKey !== null,
    }));
  }
}

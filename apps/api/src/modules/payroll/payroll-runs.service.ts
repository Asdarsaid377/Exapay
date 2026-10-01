import { createHash } from "node:crypto";

import {
  departments,
  employees,
  employeeSalaries,
  employeeSalaryItems,
  payrollAdjustments,
  payrollRunEmployees,
  payrollRuns,
  positions,
  salaryComponents,
  tenants,
  users,
} from "@exapay/db";
import { pph21IncomeFromPayroll } from "@exapay/payroll-engine";
import {
  BPJS_PROGRAMS,
  type BpjsProgram,
  type FinalizePayrollRunInput,
  type OpenPayrollRunInput,
  PAYROLL_ADJUSTMENT_LINE_KINDS,
  type PayrollAdjustmentLineKind,
  type PayrollAdjustment,
  type PayrollAdjustmentInput,
  type PayrollEmployeeDetail,
  type PayrollEmployeeSnapshot,
  payrollEmployeeSnapshotSchema,
  type PayrollRegulations,
  type PayrollRunDetail,
  type PayrollRunList,
  type PayrollRunPeriod,
  type PayrollRunRow,
  type PayrollRunSnapshot,
  payrollRunSnapshotSchema,
  type PayrollRunStatus,
  type PayrollRunTotals,
  type PayrollComponentKind,
  type PayrollSalaryItem,
  type Pph21PeriodRecord,
} from "@exapay/shared";
import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { Decimal } from "decimal.js";
import { and, asc, count, desc, eq, gte, inArray, isNull, lt, lte, or, type SQL, sql } from "drizzle-orm";

import { type AuthUser, tenantContextOf } from "../../common/auth/auth-user.js";
import { DRIZZLE } from "../../database/database.module.js";
import { uniqueViolationConstraint } from "../../database/errors.js";
import { type Database, type TenantContext, type Transaction, withTenant } from "../../database/tenant-transaction.js";
import { localClock, monthRange } from "../attendance/attendance-clock.js";
import { payrollMonthOf } from "../attendance/attendance-period.js";
import { AttendancePeriodsService } from "../attendance/attendance-periods.service.js";
import { AttendanceDeductionRulesService } from "../attendance/attendance-deduction-rules.service.js";
import { AttendanceService } from "../attendance/attendance.service.js";
import { AuditService } from "../audit/audit.service.js";
import { RegulationDataMissingError, RegulationsService } from "../regulations/regulations.service.js";
import {
  buildEmployeeDraft,
  type DraftAdjustment,
  type DraftEmployeeResult,
  type DraftSalaryVersion,
  formatIdDate,
  formatIdMonth,
  salaryVersionForPeriod,
} from "./payroll-draft.js";
import { requireSalaryManager } from "./salary-access.js";
import { toJkkRiskLevel } from "./salary-components.service.js";

const RUN_NOT_FOUND = "Periode payroll tidak ditemukan";
const EMPLOYEE_NOT_FOUND = "Karyawan tidak ada di periode payroll ini";
const ADJUSTMENT_NOT_FOUND = "Penyesuaian tidak ditemukan";
const CHANGED = "Penyesuaian ini baru saja diubah pengguna lain. Muat ulang halaman lalu coba lagi.";
const FINAL_LOCKED = "Payroll periode ini sudah final dan tidak bisa diubah";
// Bulan yang bisa dibuka: bulan payroll berjalan + 12 bulan ke belakang
const OPENABLE_MONTHS_BACK = 12;
// Batas wajar baris tambahan per karyawan per periode
const ADDED_LINES_MAX = 20;

type RunRow = {
  id: string;
  periodMonth: string;
  status: PayrollRunStatus;
  createdByName: string | null;
  createdAt: Date;
  finalizedAt: Date | null;
  finalizedByName: string | null;
  // Terisi saat final (rentang tutup buku saat itu)
  periodStart: string | null;
  periodEnd: string | null;
};

// Rentang absensi periode: final = tersimpan; draf = tutup buku usaha saat ini (feature 30b)
type RunRange = { from: string; to: string; transition: boolean };

const runColumns = {
  id: payrollRuns.id,
  periodMonth: payrollRuns.periodMonth,
  status: payrollRuns.status,
  createdByName: payrollRuns.createdByName,
  createdAt: payrollRuns.createdAt,
  finalizedAt: payrollRuns.finalizedAt,
  finalizedByName: payrollRuns.finalizedByName,
  periodStart: payrollRuns.periodStart,
  periodEnd: payrollRuns.periodEnd,
};

type EmployeeRow = {
  id: string;
  fullName: string;
  employeeNumber: string | null;
  positionName: string;
  departmentName: string;
  joinDate: string;
  endDate: string | null;
  ptkpStatus: PayrollEmployeeDetail["employee"]["ptkpStatus"];
};

type AdjustmentRow = DraftAdjustment & {
  employeeId: string;
  componentName: string | null;
  createdByName: string | null;
  createdAt: Date;
};

type TenantRow = { timeZone: string; regencyCode: string | null; payday: number | null; jkkRiskLevel: number };

type Draft = RunRange & {
  run: RunRow;
  // Tanggal tutup buku saat draf dihitung (null = akhir bulan)
  cutoffDay: number | null;
  today: string;
  tenant: TenantRow;
  warnings: string[];
  // Masukan bersama — disimpan di snapshot final
  regulations: PayrollRegulations | null;
  minimumWage: string | null;
  attendanceRules: PayrollRunSnapshot["inputs"]["attendanceRules"];
  attendanceRulesChangedOn: string | null;
  employees: { row: EmployeeRow; adjustments: AdjustmentRow[]; draft: DraftEmployeeResult; facts: PayrollEmployeeDetail["attendanceFacts"] }[];
};

// Kolom line_kind memakai enum payroll_component_kind; CHECK membatasi ke dua jenis baris tambahan
function toLineKind(kind: PayrollComponentKind | null): PayrollAdjustmentLineKind | null {
  if (kind === null) return null;
  const lineKind = PAYROLL_ADJUSTMENT_LINE_KINDS.find((candidate) => candidate === kind);
  if (!lineKind) throw new Error(`[payroll-runs/toLineKind] jenis baris tidak valid: ${kind}`);
  return lineKind;
}

// "2026-10-01" → "2026-10"
function monthOf(periodMonth: string): string {
  return periodMonth.slice(0, 7);
}

// "2026-10" → "2026-09"
function previousMonth(month: string): string {
  const year = Number(month.slice(0, 4));
  const index = Number(month.slice(5, 7));
  return index === 1 ? `${year - 1}-12` : `${year}-${String(index - 1).padStart(2, "0")}`;
}

// "2026-12" → "2027-01"
function nextMonth(month: string): string {
  const year = Number(month.slice(0, 4));
  const index = Number(month.slice(5, 7));
  return index === 12 ? `${year + 1}-01` : `${year}-${String(index + 1).padStart(2, "0")}`;
}

// "2026-10-25" → "2026-10-26"
function nextDate(date: string): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
}

// Tanggal gajian di bulan periode: hari `payday`, atau hari terakhir bulan bila bulan lebih pendek
function payDateOf(month: string, payday: number | null): string | null {
  if (payday === null) return null;
  const { to } = monthRange(month);
  const lastDay = Number(to.slice(8, 10));
  return `${month}-${String(Math.min(payday, lastDay)).padStart(2, "0")}`;
}

function toPeriod(run: RunRow, payday: number | null, range: RunRange): PayrollRunPeriod {
  const month = monthOf(run.periodMonth);
  return {
    id: run.id,
    month,
    periodStart: range.from,
    periodEnd: range.to,
    payDate: payDateOf(month, payday),
    status: run.status,
    createdByName: run.createdByName,
    createdAt: run.createdAt.toISOString(),
    finalizedAt: run.finalizedAt?.toISOString() ?? null,
    finalizedByName: run.finalizedByName,
  };
}

function toAdjustment(row: AdjustmentRow): PayrollAdjustment {
  return {
    id: row.id,
    kind: row.kind,
    lineKind: row.lineKind,
    name: row.name,
    componentId: row.componentId,
    componentName: row.componentName,
    amount: row.amount,
    reason: row.reason,
    createdByName: row.createdByName,
    createdAt: row.createdAt.toISOString(),
  };
}

function totalsOf(drafts: readonly DraftEmployeeResult[]): PayrollRunTotals {
  let employeeCount = 0;
  let grossPay = new Decimal(0);
  let bpjsEmployer = new Decimal(0);
  let bpjsEmployee = new Decimal(0);
  let pph21 = new Decimal(0);
  let takeHome = new Decimal(0);
  for (const draft of drafts) {
    if (draft.status !== "calculated" || !draft.result || !draft.pph21 || draft.takeHomePay === null) continue;
    employeeCount += 1;
    grossPay = grossPay.plus(draft.result.grossPay);
    bpjsEmployer = bpjsEmployer.plus(draft.result.bpjsEmployerTotal);
    bpjsEmployee = bpjsEmployee.plus(draft.result.bpjsEmployeeTotal);
    pph21 = pph21.plus(draft.pph21.pph21);
    takeHome = takeHome.plus(draft.takeHomePay);
  }
  return {
    employeeCount,
    grossPay: grossPay.toFixed(2),
    bpjsEmployer: bpjsEmployer.toFixed(2),
    bpjsEmployee: bpjsEmployee.toFixed(2),
    pph21: pph21.toFixed(2),
    takeHomePay: takeHome.toFixed(2),
  };
}

// Rincian satu karyawan (detail draf & snapshot final) — `warnings` = peringatan periode + karyawan
function employeeView(entry: Draft["employees"][number], periodWarnings: readonly string[]): Omit<PayrollEmployeeDetail, "run"> {
  const { row, adjustments, draft: result, facts } = entry;
  return {
    employee: {
      id: row.id,
      fullName: row.fullName,
      employeeNumber: row.employeeNumber,
      positionName: row.positionName,
      departmentName: row.departmentName,
      joinDate: row.joinDate,
      endDate: row.endDate,
      ptkpStatus: row.ptkpStatus,
    },
    status: result.status,
    message: result.message,
    salary: result.salary
      ? { effectiveFrom: result.salary.effectiveFrom, effectiveTo: result.salary.effectiveTo, items: result.salary.items, bpjsPrograms: result.salary.bpjsPrograms }
      : null,
    adjustments: adjustments.map(toAdjustment),
    attendanceFacts: result.status === "calculated" ? facts : null,
    attendanceWaived: result.attendanceWaived,
    result: result.result,
    pph21: result.pph21,
    takeHomePay: result.takeHomePay,
    warnings: [...periodWarnings, ...result.warnings],
  };
}

function draftRow(entry: Draft["employees"][number]): PayrollRunRow {
  const { row, adjustments, draft: result } = entry;
  return {
    employee: {
      id: row.id,
      fullName: row.fullName,
      employeeNumber: row.employeeNumber,
      positionName: row.positionName,
      departmentName: row.departmentName,
      joinDate: row.joinDate,
      endDate: row.endDate,
    },
    status: result.status,
    message: result.message,
    grossPay: result.result?.grossPay ?? null,
    totalDeductions: result.result?.totalDeductions ?? null,
    pph21: result.pph21?.pph21 ?? null,
    takeHomePay: result.takeHomePay,
    warningCount: result.warnings.length,
    adjustmentCount: adjustments.length,
  };
}

function snapshotRow(snapshot: PayrollEmployeeSnapshot): PayrollRunRow {
  const { employee } = snapshot;
  return {
    employee: {
      id: employee.id,
      fullName: employee.fullName,
      employeeNumber: employee.employeeNumber,
      positionName: employee.positionName,
      departmentName: employee.departmentName,
      joinDate: employee.joinDate,
      endDate: employee.endDate,
    },
    status: snapshot.status,
    message: snapshot.message,
    grossPay: snapshot.result?.grossPay ?? null,
    totalDeductions: snapshot.result?.totalDeductions ?? null,
    pph21: snapshot.pph21?.pph21 ?? null,
    takeHomePay: snapshot.takeHomePay,
    warningCount: snapshot.warnings.length,
    adjustmentCount: snapshot.adjustments.length,
  };
}

// Sidik draf yang direview: semua angka, status, penyesuaian, dan peringatan. Finalisasi menolak bila draf berubah sejak
// halaman dibuka (koreksi absensi/gaji/penyesuaian oleh pengguna lain).
function draftFingerprint(draft: Draft): string {
  const content = {
    warnings: draft.warnings,
    employees: draft.employees.map((entry) => employeeView(entry, [])),
  };
  return createHash("sha256").update(JSON.stringify(content)).digest("hex");
}

// Run payroll — draf & review (feature 29). Owner/admin saja (peran dibaca ulang dari DB). Periode = bulan kalender,
// satu per usaha. Angka draf dihitung saat dibaca (payroll-draft.ts → payroll-engine) dari gaji berlaku, absensi,
// aturan potongan versi hari pertama periode, regulasi tanggal 1, dan penyesuaian admin — sehingga koreksi absensi/gaji
// langsung terlihat. Finalisasi (feature 30) menyimpan snapshot immutable (payroll_runs.snapshot + payroll_run_employees);
// periode final dibaca dari snapshot. Membuka periode, penyesuaian, dan finalisasi diaudit.
// Urutan kunci: advisory `payroll-runs:<tenant>` (buka/final) → payroll_runs → payroll_adjustments.
@Injectable()
export class PayrollRunsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly attendance: AttendanceService,
    private readonly periods: AttendancePeriodsService,
    private readonly deductions: AttendanceDeductionRulesService,
    private readonly regulations: RegulationsService,
    private readonly audit: AuditService,
  ) {}

  async list(user: AuthUser): Promise<PayrollRunList> {
    const ctx = tenantContextOf(user);
    return withTenant(this.db, ctx, async (tx) => {
      await requireSalaryManager(tx, ctx);
      const tenant = await this.loadTenant(tx, ctx);
      const today = localClock(new Date(), tenant.timeZone).date;
      const runs = await tx
        .select({ ...runColumns, adjustmentCount: count(payrollAdjustments.id) })
        .from(payrollRuns)
        .leftJoin(payrollAdjustments, eq(payrollAdjustments.runId, payrollRuns.id))
        .groupBy(payrollRuns.id)
        .orderBy(desc(payrollRuns.periodMonth));
      const opened = new Set(runs.map((run) => monthOf(run.periodMonth)));
      // Terbaru dulu → periode final pertama = final terakhir; bulan sebelumnya tidak bisa dibuka lagi
      const lastFinal = runs.find((run) => run.status === "final");
      const openFrom = lastFinal ? nextMonth(monthOf(lastFinal.periodMonth)) : "";
      return {
        today,
        openableMonths: (await this.candidateMonths(tx, ctx, today)).filter((month) => !opened.has(month) && month >= openFrom),
        runs: await Promise.all(
          runs.map(async (run) => ({ ...toPeriod(run, tenant.payday, await this.rangeOf(tx, ctx, run)), adjustmentCount: run.adjustmentCount })),
        ),
      };
    });
  }

  async open(user: AuthUser, input: OpenPayrollRunInput): Promise<{ id: string }> {
    const ctx = tenantContextOf(user);
    try {
      return await withTenant(this.db, ctx, async (tx) => {
        await requireSalaryManager(tx, ctx);
        const tenant = await this.loadTenant(tx, ctx);
        const today = localClock(new Date(), tenant.timeZone).date;
        if (!(await this.candidateMonths(tx, ctx, today)).includes(input.month)) {
          throw new BadRequestException("Periode yang bisa dibuka: bulan berjalan sampai 12 bulan ke belakang");
        }
        const periodMonth = `${input.month}-01`;
        await this.lockRunSequence(tx, ctx);
        const [existing] = await tx.select({ id: payrollRuns.id }).from(payrollRuns).where(eq(payrollRuns.periodMonth, periodMonth));
        if (existing) throw new ConflictException(`Periode ${formatIdMonth(input.month)} sudah dibuka`);
        // Final berurutan per bulan (feature 30): bulan sebelum periode final terakhir tidak bisa dibuka lagi
        const [laterFinal] = await tx
          .select({ periodMonth: payrollRuns.periodMonth })
          .from(payrollRuns)
          .where(and(eq(payrollRuns.status, "final"), gte(payrollRuns.periodMonth, periodMonth)))
          .orderBy(desc(payrollRuns.periodMonth))
          .limit(1);
        if (laterFinal) {
          throw new BadRequestException(
            `Payroll ${formatIdMonth(monthOf(laterFinal.periodMonth))} sudah final — periode sebelumnya tidak bisa dibuka lagi. Koreksi lewat penyesuaian periode berikutnya.`,
          );
        }

        const [actor] = await tx.select({ fullName: users.fullName }).from(users).where(eq(users.id, user.userId));
        const [created] = await tx
          .insert(payrollRuns)
          .values({ tenantId: ctx.tenantId, periodMonth, createdByUserId: user.userId, createdByName: actor?.fullName ?? null })
          .returning({ id: payrollRuns.id });
        if (!created) throw new Error("[payroll-runs/open] insert tidak mengembalikan baris");
        await this.audit.record(tx, ctx, { entity: "payroll_run", entityId: created.id, action: "create", after: { month: input.month } });
        return created;
      });
    } catch (error) {
      if (uniqueViolationConstraint(error) === "payroll_runs_tenant_month_key") throw new ConflictException("Periode ini baru saja dibuka pengguna lain");
      throw error;
    }
  }

  async detail(user: AuthUser, runId: string): Promise<PayrollRunDetail> {
    const ctx = tenantContextOf(user);
    return withTenant(this.db, ctx, async (tx) => {
      await requireSalaryManager(tx, ctx);
      const run = await this.findRun(tx, runId);
      if (run.status === "final") {
        const tenant = await this.loadTenant(tx, ctx);
        const snapshot = await this.loadRunSnapshot(tx, run.id);
        const employeeSnapshots = await this.loadEmployeeSnapshots(tx, run.id, null);
        return {
          ...toPeriod(run, tenant.payday, await this.rangeOf(tx, ctx, run)),
          payDate: snapshot.payDate,
          today: localClock(new Date(), tenant.timeZone).date,
          periodEnded: true,
          warnings: snapshot.warnings,
          totals: snapshot.totals,
          rows: employeeSnapshots.map(snapshotRow),
          finalization: null,
        };
      }
      const draft = await this.loadDraft(tx, ctx, run, null);
      return {
        ...toPeriod(run, draft.tenant.payday, draft),
        today: draft.today,
        periodEnded: draft.today > draft.to,
        warnings: draft.warnings,
        totals: totalsOf(draft.employees.map((employee) => employee.draft)),
        rows: draft.employees.map(draftRow),
        finalization: { blockers: await this.finalizeBlockers(tx, draft), fingerprint: draftFingerprint(draft) },
      };
    });
  }

  async employeeDetail(user: AuthUser, runId: string, employeeId: string): Promise<PayrollEmployeeDetail> {
    const ctx = tenantContextOf(user);
    return withTenant(this.db, ctx, async (tx) => {
      await requireSalaryManager(tx, ctx);
      const run = await this.findRun(tx, runId);
      if (run.status === "final") {
        const tenant = await this.loadTenant(tx, ctx);
        const snapshot = await this.loadRunSnapshot(tx, run.id);
        const [employeeSnapshot] = await this.loadEmployeeSnapshots(tx, run.id, employeeId);
        if (!employeeSnapshot) throw new NotFoundException(EMPLOYEE_NOT_FOUND);
        return {
          run: { ...toPeriod(run, tenant.payday, await this.rangeOf(tx, ctx, run)), payDate: snapshot.payDate, periodEnded: true },
          ...employeeSnapshot,
          warnings: [...snapshot.warnings, ...employeeSnapshot.warnings],
        };
      }
      const draft = await this.loadDraft(tx, ctx, run, employeeId);
      const entry = draft.employees[0];
      if (!entry) throw new NotFoundException(EMPLOYEE_NOT_FOUND);
      return { run: { ...toPeriod(run, draft.tenant.payday, draft), periodEnded: draft.today > draft.to }, ...employeeView(entry, draft.warnings) };
    });
  }

  // ——— finalisasi (feature 30) ———

  // Satu transaksi: hitung ulang draf di bawah kunci periode, cek syarat & sidik draf yang direview, simpan snapshot per
  // karyawan + periode, tandai final, audit. Setelah ini angka periode tidak pernah dihitung ulang.
  async finalize(user: AuthUser, runId: string, input: FinalizePayrollRunInput): Promise<void> {
    const ctx = tenantContextOf(user);
    await withTenant(this.db, ctx, async (tx) => {
      await requireSalaryManager(tx, ctx);
      await this.lockRunSequence(tx, ctx);
      const run = await this.findRun(tx, runId, "update");
      if (run.status === "final") throw new ConflictException("Payroll periode ini sudah final");

      const draft = await this.loadDraft(tx, ctx, run, null);
      const blockers = await this.finalizeBlockers(tx, draft);
      if (blockers.length > 0) throw new BadRequestException(blockers.join(" "));
      if (draftFingerprint(draft) !== input.fingerprint) {
        throw new ConflictException("Angka draf berubah sejak halaman dibuka (absensi, gaji, atau penyesuaian). Muat ulang, periksa lagi, lalu finalisasi.");
      }

      for (const entry of draft.employees) {
        // Peringatan karyawan saja — peringatan periode ada di snapshot periode (digabung saat dibaca)
        const view = employeeView(entry, []);
        const status = view.status;
        if (status !== "calculated" && status !== "excluded") throw new Error("[payroll-runs/finalize] status karyawan belum bisa difinalisasi");
        const { result, pph21 } = entry.draft;
        const amounts =
          status === "calculated" && result && pph21 && view.takeHomePay !== null
            ? {
                grossPay: result.grossPay,
                totalDeductions: result.totalDeductions,
                bpjsEmployer: result.bpjsEmployerTotal,
                bpjsEmployee: result.bpjsEmployeeTotal,
                pph21: pph21.pph21,
                takeHomePay: view.takeHomePay,
                pph21GrossIncome: pph21.grossIncome,
                pensionContribution: pph21IncomeFromPayroll(result).pensionContribution,
              }
            : {};
        const snapshot: PayrollEmployeeSnapshot = { ...view, status };
        await tx.insert(payrollRunEmployees).values({
          tenantId: ctx.tenantId,
          runId: run.id,
          employeeId: entry.row.id,
          status,
          fullName: entry.row.fullName,
          employeeNumber: entry.row.employeeNumber,
          ...amounts,
          snapshot,
        });
      }

      const month = monthOf(run.periodMonth);
      const totals = totalsOf(draft.employees.map((employee) => employee.draft));
      const runSnapshot: PayrollRunSnapshot = {
        version: 1,
        finalizedOn: draft.today,
        payDate: payDateOf(month, draft.tenant.payday),
        warnings: draft.warnings,
        totals,
        inputs: {
          timeZone: draft.tenant.timeZone,
          regencyCode: draft.tenant.regencyCode,
          minimumWage: draft.minimumWage,
          jkkRiskLevel: draft.tenant.jkkRiskLevel,
          attendanceCutoffDay: draft.cutoffDay,
          attendanceRules: draft.attendanceRules,
          attendanceRulesChangedOn: draft.attendanceRulesChangedOn,
          regulations: draft.regulations,
        },
      };
      const [actor] = await tx.select({ fullName: users.fullName }).from(users).where(eq(users.id, user.userId));
      await tx
        .update(payrollRuns)
        .set({
          status: "final",
          finalizedAt: sql`now()`,
          finalizedByUserId: user.userId,
          finalizedByName: actor?.fullName ?? null,
          snapshot: runSnapshot,
          // Rentang tutup buku saat final — periode berikutnya dimulai sehari sesudahnya
          periodStart: draft.from,
          periodEnd: draft.to,
        })
        .where(eq(payrollRuns.id, run.id));
      await this.audit.record(tx, ctx, {
        entity: "payroll_run",
        entityId: run.id,
        action: "finalize",
        before: { status: "draft" },
        after: {
          status: "final",
          month,
          periodStart: draft.from,
          periodEnd: draft.to,
          totals,
          excluded: draft.employees.filter((employee) => employee.draft.status === "excluded").map((employee) => employee.row.id),
        },
      });
    });
  }

  // Syarat finalisasi (keputusan user): periode berakhir, semua karyawan terhitung/dikeluarkan, ada yang dihitung,
  // periode sebelumnya yang sudah dibuka sudah final
  private async finalizeBlockers(tx: Transaction, draft: Draft): Promise<string[]> {
    const blockers: string[] = [];
    if (draft.today <= draft.to) {
      blockers.push(`Periode baru bisa difinalisasi setelah absensi ditutup (mulai ${formatIdDate(nextDate(draft.to))}).`);
    }
    const [earlierDraft] = await tx
      .select({ periodMonth: payrollRuns.periodMonth })
      .from(payrollRuns)
      .where(and(eq(payrollRuns.status, "draft"), lt(payrollRuns.periodMonth, draft.run.periodMonth)))
      .orderBy(asc(payrollRuns.periodMonth))
      .limit(1);
    if (earlierDraft) {
      blockers.push(`Payroll ${formatIdMonth(monthOf(earlierDraft.periodMonth))} masih draf — finalisasi periode sebelumnya lebih dulu.`);
    }
    const pending = draft.employees.filter((employee) => employee.draft.status === "no_salary" || employee.draft.status === "error").length;
    if (pending > 0) {
      blockers.push(`${pending} karyawan belum bisa dihitung — atur gajinya atau keluarkan dari periode ini.`);
    } else if (!draft.employees.some((employee) => employee.draft.status === "calculated")) {
      blockers.push("Belum ada karyawan yang dihitung di periode ini.");
    }
    return blockers;
  }

  // ——— penyesuaian ———

  // add_line = baris baru; override_component / waive_attendance / exclude = satu per (karyawan, komponen/jenis) — yang
  // sudah ada diganti isinya.
  async addAdjustment(user: AuthUser, runId: string, employeeId: string, input: PayrollAdjustmentInput): Promise<void> {
    const ctx = tenantContextOf(user);
    try {
      await withTenant(this.db, ctx, async (tx) => {
        await requireSalaryManager(tx, ctx);
        const run = await this.findDraftRun(tx, runId);
        const employee = await this.findRunEmployee(tx, ctx, run, employeeId);
        await this.checkAdjustment(tx, ctx, run, employee, input);

        const existing = await this.findSameAdjustment(tx, run.id, employee.id, input);
        if (existing) {
          await this.updateRow(tx, ctx, existing, input);
          return;
        }
        if (input.kind === "add_line") {
          const [added] = await tx
            .select({ total: count() })
            .from(payrollAdjustments)
            .where(and(eq(payrollAdjustments.runId, run.id), eq(payrollAdjustments.employeeId, employee.id), eq(payrollAdjustments.kind, "add_line")));
          if ((added?.total ?? 0) >= ADDED_LINES_MAX) throw new BadRequestException(`Maksimal ${ADDED_LINES_MAX} baris tambahan per karyawan`);
        }
        const [actor] = await tx.select({ fullName: users.fullName }).from(users).where(eq(users.id, user.userId));
        const values = this.valuesOf(input);
        const [created] = await tx
          .insert(payrollAdjustments)
          .values({
            tenantId: ctx.tenantId,
            runId: run.id,
            employeeId: employee.id,
            kind: input.kind,
            ...values,
            createdByUserId: user.userId,
            createdByName: actor?.fullName ?? null,
          })
          .returning({ id: payrollAdjustments.id });
        if (!created) throw new Error("[payroll-runs/addAdjustment] insert tidak mengembalikan baris");
        await this.audit.record(tx, ctx, {
          entity: "payroll_adjustment",
          entityId: created.id,
          action: "create",
          after: { runId: run.id, month: monthOf(run.periodMonth), employeeId: employee.id, kind: input.kind, ...values },
        });
      });
    } catch (error) {
      // Dua penyimpanan bersamaan untuk komponen/jenis yang sama
      const constraint = uniqueViolationConstraint(error);
      if (constraint === "payroll_adjustments_single_key" || constraint === "payroll_adjustments_override_key") throw new ConflictException(CHANGED);
      throw error;
    }
  }

  async updateAdjustment(user: AuthUser, runId: string, adjustmentId: string, input: PayrollAdjustmentInput): Promise<void> {
    const ctx = tenantContextOf(user);
    await withTenant(this.db, ctx, async (tx) => {
      await requireSalaryManager(tx, ctx);
      const run = await this.findDraftRun(tx, runId);
      const existing = await this.findAdjustment(tx, run.id, adjustmentId);
      if (existing.kind !== input.kind) throw new BadRequestException("Jenis penyesuaian tidak bisa diubah");
      if (input.kind === "override_component" && input.componentId !== existing.componentId) {
        throw new BadRequestException("Komponen tidak bisa diganti — hapus penyesuaian ini lalu buat yang baru");
      }
      const employee = await this.findRunEmployee(tx, ctx, run, existing.employeeId);
      await this.checkAdjustment(tx, ctx, run, employee, input);
      await this.updateRow(tx, ctx, existing, input);
    });
  }

  async deleteAdjustment(user: AuthUser, runId: string, adjustmentId: string): Promise<void> {
    const ctx = tenantContextOf(user);
    await withTenant(this.db, ctx, async (tx) => {
      await requireSalaryManager(tx, ctx);
      const run = await this.findDraftRun(tx, runId);
      const existing = await this.findAdjustment(tx, run.id, adjustmentId);
      await tx.delete(payrollAdjustments).where(eq(payrollAdjustments.id, existing.id));
      await this.audit.record(tx, ctx, {
        entity: "payroll_adjustment",
        entityId: existing.id,
        action: "delete",
        before: { runId: run.id, month: monthOf(run.periodMonth), employeeId: existing.employeeId, kind: existing.kind, ...this.rowValues(existing) },
      });
    });
  }

  // ——— draf ———

  // Hitung draf semua karyawan periode ini (employeeId = satu karyawan saja). Karyawan = masa kerja beririsan dengan
  // rentang absensi (tutup buku, feature 30b). Gaji sebulan, PPh 21 masa & regulasi/BPJS tetap bulan payroll.
  private async loadDraft(tx: Transaction, ctx: TenantContext, run: RunRow, employeeId: string | null): Promise<Draft> {
    const month = monthOf(run.periodMonth);
    const range = await this.periods.payrollPeriod(tx, ctx, month);
    const { from, to } = range;
    const monthStart = `${month}-01`;
    const tenant = await this.loadTenant(tx, ctx);
    const today = localClock(new Date(), tenant.timeZone).date;
    const warnings: string[] = [];

    const employeeRows = await this.selectEmployees(
      tx,
      and(lte(employees.joinDate, to), or(isNull(employees.endDate), gte(employees.endDate, from)), employeeId ? eq(employees.id, employeeId) : undefined),
    );
    const ids = employeeRows.map((row) => row.id);
    const versions = await this.selectSalaryVersions(tx, ids, from, to);
    const adjustments = await this.selectAdjustments(tx, run.id, ids);
    const previousPeriods = await this.selectPreviousPeriods(tx, run.periodMonth, ids);
    const periodRules = await this.deductions.periodRules(tx, from, to);
    const facts = await this.deductions.periodFactsMany(tx, employeeRows, from, to, today);

    // Data referensi platform (bukan data tenant) — dibaca RegulationsService di luar transaksi ini
    let regulations: PayrollRegulations | null = null;
    let regulationError: string | null = null;
    try {
      regulations = await this.regulations.forDate(monthStart);
    } catch (error) {
      if (!(error instanceof RegulationDataMissingError)) throw error;
      regulationError = `Data regulasi payroll untuk periode ini belum lengkap (${error.missing.join(", ")}). Draf belum bisa dihitung — hubungi dukungan Exapay.`;
      warnings.push(regulationError);
    }
    const minimumWage = tenant.regencyCode ? ((await this.regulations.minimumWage(tenant.regencyCode, monthStart))?.monthlyAmount ?? null) : null;

    if (today <= to) {
      warnings.push(`Periode belum berakhir — absensi baru dihitung sampai hari ini. Angka draf masih bisa berubah sampai ${formatIdDate(to)}.`);
    }
    if (range.transition) {
      warnings.push(
        `Periode peralihan ${formatIdDate(from)} – ${formatIdDate(to)}: tanggal tutup buku berubah setelah periode bulan lalu final, jadi periode ini dimulai sehari setelah periode final itu.`,
      );
    }
    const payDate = payDateOf(month, tenant.payday);
    if (payDate !== null && payDate <= to) {
      warnings.push(
        `Tanggal gajian (${formatIdDate(payDate)}) jatuh sebelum absensi ditutup (${formatIdDate(to)}) — payroll belum bisa difinalisasi di hari gajian. Atur tanggal tutup buku di Profil usaha.`,
      );
    }
    if (periodRules.changedOn) {
      warnings.push(
        `Aturan potongan absensi berubah mulai ${formatIdDate(periodRules.changedOn)} — periode ini memakai aturan yang berlaku di hari pertama periode; aturan baru dipakai mulai periode berikutnya.`,
      );
    }
    if (tenant.regencyCode === null) {
      warnings.push("Lokasi usaha belum diatur di Profil usaha — batas bawah iuran BPJS Kesehatan (upah minimum) tidak diterapkan.");
    }

    const jkkRiskLevel = toJkkRiskLevel(tenant.jkkRiskLevel);
    return {
      run,
      from,
      to,
      transition: range.transition,
      cutoffDay: range.cutoffDay,
      today,
      tenant,
      warnings,
      regulations,
      minimumWage,
      attendanceRules: periodRules.rules,
      attendanceRulesChangedOn: periodRules.changedOn,
      employees: employeeRows.map((row) => {
        const own = adjustments.filter((adjustment) => adjustment.employeeId === row.id);
        const employeeFacts = facts.get(row.id);
        if (!employeeFacts) throw new Error("[payroll-runs/loadDraft] fakta absensi karyawan tidak terbentuk");
        const draft = buildEmployeeDraft({
          month: Number(month.slice(5, 7)),
          from,
          to,
          employee: { joinDate: row.joinDate, endDate: row.endDate, ptkpStatus: row.ptkpStatus },
          salaryVersions: versions.get(row.id) ?? [],
          adjustments: own,
          previousPeriods: previousPeriods.get(row.id) ?? [],
          rules: periodRules.rules,
          facts: employeeFacts,
          regulations,
          regulationError,
          minimumWage,
          jkkRiskLevel,
        });
        return { row, adjustments: own, draft, facts: employeeFacts };
      }),
    };
  }

  // ——— helper ———

  // Bulan payroll berjalan (periode tutup buku yang memuat hari ini, feature 30b) + 12 bulan ke belakang
  private async candidateMonths(tx: Transaction, ctx: TenantContext, today: string): Promise<string[]> {
    const months = [payrollMonthOf(today, await this.periods.cutoffDay(tx, ctx))];
    for (let i = 0; i < OPENABLE_MONTHS_BACK; i += 1) {
      const last = months[months.length - 1];
      if (last) months.push(previousMonth(last));
    }
    return months;
  }

  private async loadTenant(tx: Transaction, ctx: TenantContext): Promise<TenantRow> {
    const [tenant] = await tx
      .select({ regencyCode: tenants.regencyCode, payday: tenants.payday, jkkRiskLevel: tenants.jkkRiskLevel })
      .from(tenants)
      .where(eq(tenants.id, ctx.tenantId));
    if (!tenant) throw new NotFoundException("Usaha tidak ditemukan");
    return { ...tenant, timeZone: await this.attendance.tenantTimeZone(tx, ctx.tenantId) };
  }

  private async findRun(tx: Transaction, runId: string, lock?: "update" | "share"): Promise<RunRow> {
    const query = tx.select(runColumns).from(payrollRuns).where(eq(payrollRuns.id, runId));
    const [run] = await (lock ? query.for(lock) : query);
    if (!run) throw new NotFoundException(RUN_NOT_FOUND);
    return run;
  }

  // FOR SHARE: penyesuaian tidak bersamaan dengan finalisasi (yang mengunci FOR UPDATE)
  private async findDraftRun(tx: Transaction, runId: string): Promise<RunRow> {
    const run = await this.findRun(tx, runId, "share");
    if (run.status !== "draft") throw new ConflictException(FINAL_LOCKED);
    return run;
  }

  private async rangeOf(tx: Transaction, ctx: TenantContext, run: RunRow): Promise<RunRange> {
    if (run.status === "final" && run.periodStart && run.periodEnd) return { from: run.periodStart, to: run.periodEnd, transition: false };
    const { from, to, transition } = await this.periods.payrollPeriod(tx, ctx, monthOf(run.periodMonth));
    return { from, to, transition };
  }

  // Buka periode & finalisasi bergantian per usaha — urutan bulan final tetap terjaga
  private async lockRunSequence(tx: Transaction, ctx: TenantContext): Promise<void> {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`payroll-runs:${ctx.tenantId}`}, 0))`);
  }

  private async loadRunSnapshot(tx: Transaction, runId: string): Promise<PayrollRunSnapshot> {
    const [row] = await tx.select({ snapshot: payrollRuns.snapshot }).from(payrollRuns).where(eq(payrollRuns.id, runId));
    return payrollRunSnapshotSchema.parse(row?.snapshot);
  }

  // Snapshot final per karyawan, urut nama (employeeId = satu karyawan saja)
  private async loadEmployeeSnapshots(tx: Transaction, runId: string, employeeId: string | null): Promise<PayrollEmployeeSnapshot[]> {
    const rows = await tx
      .select({ snapshot: payrollRunEmployees.snapshot })
      .from(payrollRunEmployees)
      .where(and(eq(payrollRunEmployees.runId, runId), employeeId ? eq(payrollRunEmployees.employeeId, employeeId) : undefined))
      .orderBy(asc(payrollRunEmployees.fullName), asc(payrollRunEmployees.employeeId));
    return rows.map((row) => payrollEmployeeSnapshotSchema.parse(row.snapshot));
  }

  // Masa PPh 21 sebelumnya di tahun pajak yang sama dari payroll final (karyawan dihitung saja), per karyawan
  private async selectPreviousPeriods(tx: Transaction, periodMonth: string, employeeIds: readonly string[]): Promise<Map<string, Pph21PeriodRecord[]>> {
    const byEmployee = new Map<string, Pph21PeriodRecord[]>();
    if (employeeIds.length === 0 || periodMonth.slice(5, 7) === "01") return byEmployee;
    const rows = await tx
      .select({
        employeeId: payrollRunEmployees.employeeId,
        periodMonth: payrollRuns.periodMonth,
        grossIncome: payrollRunEmployees.pph21GrossIncome,
        pensionContribution: payrollRunEmployees.pensionContribution,
        pph21: payrollRunEmployees.pph21,
      })
      .from(payrollRunEmployees)
      .innerJoin(payrollRuns, eq(payrollRuns.id, payrollRunEmployees.runId))
      .where(
        and(
          inArray(payrollRunEmployees.employeeId, [...employeeIds]),
          eq(payrollRunEmployees.status, "calculated"),
          eq(payrollRuns.status, "final"),
          gte(payrollRuns.periodMonth, `${periodMonth.slice(0, 4)}-01-01`),
          lt(payrollRuns.periodMonth, periodMonth),
        ),
      )
      .orderBy(asc(payrollRuns.periodMonth));
    for (const row of rows) {
      // CHECK payroll_run_employees_amounts: baris calculated selalu berisi angka
      if (row.grossIncome === null || row.pensionContribution === null || row.pph21 === null) continue;
      const list = byEmployee.get(row.employeeId) ?? [];
      list.push({
        month: Number(row.periodMonth.slice(5, 7)),
        grossIncome: row.grossIncome,
        pensionContribution: row.pensionContribution,
        religiousContribution: "0",
        pph21Withheld: row.pph21,
      });
      byEmployee.set(row.employeeId, list);
    }
    return byEmployee;
  }

  // Karyawan yang masa kerjanya beririsan dengan rentang periode
  private async findRunEmployee(tx: Transaction, ctx: TenantContext, run: RunRow, employeeId: string): Promise<EmployeeRow> {
    const { from, to } = await this.rangeOf(tx, ctx, run);
    const [row] = await this.selectEmployees(
      tx,
      and(eq(employees.id, employeeId), lte(employees.joinDate, to), or(isNull(employees.endDate), gte(employees.endDate, from))),
    );
    if (!row) throw new NotFoundException(EMPLOYEE_NOT_FOUND);
    return row;
  }

  // Validasi isi penyesuaian terhadap gaji karyawan periode ini
  private async checkAdjustment(tx: Transaction, ctx: TenantContext, run: RunRow, employee: EmployeeRow, input: PayrollAdjustmentInput): Promise<void> {
    if (input.kind !== "override_component") return;
    const { from, to } = await this.rangeOf(tx, ctx, run);
    const versions = (await this.selectSalaryVersions(tx, [employee.id], from, to)).get(employee.id) ?? [];
    const { version } = salaryVersionForPeriod(versions, from, to, employee);
    const item = version?.items.find((candidate) => candidate.componentId === input.componentId);
    if (!item) throw new BadRequestException("Komponen ini tidak ada di gaji karyawan untuk periode ini");
    if (item.kind === "base_salary" && !/[1-9]/.test(input.amount)) throw new BadRequestException("Gaji pokok harus lebih dari 0");
  }

  private valuesOf(input: PayrollAdjustmentInput): Pick<DraftAdjustment, "lineKind" | "name" | "componentId" | "amount" | "reason"> {
    switch (input.kind) {
      case "add_line":
        return { lineKind: input.lineKind, name: input.name, componentId: null, amount: input.amount, reason: null };
      case "override_component":
        return { lineKind: null, name: null, componentId: input.componentId, amount: input.amount, reason: input.reason };
      case "waive_attendance":
      case "exclude":
        return { lineKind: null, name: null, componentId: null, amount: null, reason: input.reason };
    }
  }

  private rowValues(row: AdjustmentRow): Pick<DraftAdjustment, "lineKind" | "name" | "componentId" | "amount" | "reason"> {
    return { lineKind: row.lineKind, name: row.name, componentId: row.componentId, amount: row.amount, reason: row.reason };
  }

  // Ubah isian (jenis, karyawan, komponen tetap)
  private async updateRow(tx: Transaction, ctx: TenantContext, existing: AdjustmentRow, input: PayrollAdjustmentInput): Promise<void> {
    const { lineKind, name, amount, reason } = this.valuesOf(input);
    await tx.update(payrollAdjustments).set({ lineKind, name, amount, reason }).where(eq(payrollAdjustments.id, existing.id));
    await this.audit.record(tx, ctx, {
      entity: "payroll_adjustment",
      entityId: existing.id,
      action: "update",
      before: { employeeId: existing.employeeId, kind: existing.kind, ...this.rowValues(existing) },
      after: { employeeId: existing.employeeId, kind: existing.kind, ...this.valuesOf(input) },
    });
  }

  // Penyesuaian satu-per-karyawan yang sudah ada (dikunci) — add_line selalu baris baru
  private async findSameAdjustment(tx: Transaction, runId: string, employeeId: string, input: PayrollAdjustmentInput): Promise<AdjustmentRow | null> {
    if (input.kind === "add_line") return null;
    const rows = await this.selectAdjustmentRows(
      tx,
      and(
        eq(payrollAdjustments.runId, runId),
        eq(payrollAdjustments.employeeId, employeeId),
        eq(payrollAdjustments.kind, input.kind),
        input.kind === "override_component" ? eq(payrollAdjustments.componentId, input.componentId) : undefined,
      ),
      true,
    );
    return rows[0] ?? null;
  }

  private async findAdjustment(tx: Transaction, runId: string, adjustmentId: string): Promise<AdjustmentRow> {
    const [row] = await this.selectAdjustmentRows(tx, and(eq(payrollAdjustments.runId, runId), eq(payrollAdjustments.id, adjustmentId)), true);
    if (!row) throw new NotFoundException(ADJUSTMENT_NOT_FOUND);
    return row;
  }

  private selectEmployees(tx: Transaction, where: SQL | undefined): Promise<EmployeeRow[]> {
    return tx
      .select({
        id: employees.id,
        fullName: employees.fullName,
        employeeNumber: employees.employeeNumber,
        positionName: positions.name,
        departmentName: departments.name,
        joinDate: employees.joinDate,
        endDate: employees.endDate,
        ptkpStatus: employees.ptkpStatus,
      })
      .from(employees)
      .innerJoin(positions, eq(positions.id, employees.positionId))
      .innerJoin(departments, eq(departments.id, employees.departmentId))
      .where(where)
      .orderBy(asc(employees.fullName), asc(employees.id));
  }

  // Versi gaji yang beririsan dengan periode, per karyawan (item urut katalog komponen)
  private async selectSalaryVersions(tx: Transaction, employeeIds: readonly string[], from: string, to: string): Promise<Map<string, DraftSalaryVersion[]>> {
    const byEmployee = new Map<string, DraftSalaryVersion[]>();
    if (employeeIds.length === 0) return byEmployee;
    const rows = await tx
      .select({
        id: employeeSalaries.id,
        employeeId: employeeSalaries.employeeId,
        effectiveFrom: employeeSalaries.effectiveFrom,
        effectiveTo: employeeSalaries.effectiveTo,
        bpjsKesehatan: employeeSalaries.bpjsKesehatan,
        bpjsJht: employeeSalaries.bpjsJht,
        bpjsJp: employeeSalaries.bpjsJp,
        bpjsJkk: employeeSalaries.bpjsJkk,
        bpjsJkm: employeeSalaries.bpjsJkm,
      })
      .from(employeeSalaries)
      .where(
        and(
          inArray(employeeSalaries.employeeId, [...employeeIds]),
          lte(employeeSalaries.effectiveFrom, to),
          or(isNull(employeeSalaries.effectiveTo), gte(employeeSalaries.effectiveTo, from)),
        ),
      )
      .orderBy(asc(employeeSalaries.effectiveFrom));
    const items = new Map<string, PayrollSalaryItem[]>();
    if (rows.length > 0) {
      const itemRows = await tx
        .select({
          salaryId: employeeSalaryItems.salaryId,
          componentId: employeeSalaryItems.componentId,
          name: salaryComponents.name,
          kind: salaryComponents.kind,
          amount: employeeSalaryItems.amount,
        })
        .from(employeeSalaryItems)
        .innerJoin(salaryComponents, eq(salaryComponents.id, employeeSalaryItems.componentId))
        .where(
          inArray(
            employeeSalaryItems.salaryId,
            rows.map((row) => row.id),
          ),
        )
        .orderBy(asc(salaryComponents.sortOrder), asc(salaryComponents.name));
      for (const { salaryId, ...item } of itemRows) {
        const list = items.get(salaryId) ?? [];
        list.push(item);
        items.set(salaryId, list);
      }
    }
    for (const row of rows) {
      const joined: Record<BpjsProgram, boolean> = { kesehatan: row.bpjsKesehatan, jht: row.bpjsJht, jp: row.bpjsJp, jkk: row.bpjsJkk, jkm: row.bpjsJkm };
      const list = byEmployee.get(row.employeeId) ?? [];
      list.push({
        id: row.id,
        effectiveFrom: row.effectiveFrom,
        effectiveTo: row.effectiveTo,
        items: items.get(row.id) ?? [],
        // Urutan BPJS_PROGRAMS
        bpjsPrograms: BPJS_PROGRAMS.filter((program) => joined[program]),
      });
      byEmployee.set(row.employeeId, list);
    }
    return byEmployee;
  }

  private async selectAdjustments(tx: Transaction, runId: string, employeeIds: readonly string[]): Promise<AdjustmentRow[]> {
    if (employeeIds.length === 0) return [];
    return this.selectAdjustmentRows(tx, and(eq(payrollAdjustments.runId, runId), inArray(payrollAdjustments.employeeId, [...employeeIds])), false);
  }

  // Urutan dibuat; `lock` = FOR UPDATE (ubah/hapus)
  private async selectAdjustmentRows(tx: Transaction, where: SQL | undefined, lock: boolean): Promise<AdjustmentRow[]> {
    const query = tx
      .select({
        id: payrollAdjustments.id,
        employeeId: payrollAdjustments.employeeId,
        kind: payrollAdjustments.kind,
        lineKind: payrollAdjustments.lineKind,
        name: payrollAdjustments.name,
        componentId: payrollAdjustments.componentId,
        componentName: salaryComponents.name,
        amount: payrollAdjustments.amount,
        reason: payrollAdjustments.reason,
        createdByName: payrollAdjustments.createdByName,
        createdAt: payrollAdjustments.createdAt,
      })
      .from(payrollAdjustments)
      .leftJoin(salaryComponents, eq(salaryComponents.id, payrollAdjustments.componentId))
      .where(where)
      .orderBy(asc(payrollAdjustments.createdAt), asc(payrollAdjustments.id));
    const rows = await (lock ? query.for("update", { of: payrollAdjustments }) : query);
    return rows.map((row) => ({ ...row, lineKind: toLineKind(row.lineKind) }));
  }
}

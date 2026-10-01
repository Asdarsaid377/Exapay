import { employees, payrollRunEmployees, payrollRuns, tenants } from "@exapay/db";
import { type PayrollReport, type PayrollReportMonth, payrollEmployeeSnapshotSchema, type PayrollRunTotals } from "@exapay/shared";
import { ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { Decimal } from "decimal.js";
import { and, asc, count, eq, gte, lt, sql } from "drizzle-orm";

import { type AuthUser, tenantContextOf } from "../../common/auth/auth-user.js";
import { FieldCipher } from "../../common/crypto/field-cipher.js";
import { DRIZZLE } from "../../database/database.module.js";
import { type Database, type TenantContext, type Transaction, withTenant } from "../../database/tenant-transaction.js";
import { localClock } from "../attendance/attendance-clock.js";
import { AttendanceService } from "../attendance/attendance.service.js";
import { AuditService } from "../audit/audit.service.js";
import { FIELD } from "../employees/employees.service.js";
import { formatIdDate, formatIdMonth } from "./payroll-draft.js";
import { buildContributionsWorkbook, buildTransferWorkbook, type PeriodInfo } from "./payroll-reports.excel.js";
import { requireSalaryManager } from "./salary-access.js";

const RUN_NOT_FOUND = "Periode payroll tidak ditemukan";
const NOT_FINAL = "Laporan & ekspor tersedia setelah payroll periode ini final";

export type ReportFile = { buffer: Buffer; fileName: string };

type FinalRun = { id: string; periodMonth: string; periodStart: string; periodEnd: string; payDate: string | null };

// Jumlah kolom snapshot karyawan dihitung (numeric Postgres → string, tanpa float)
const totalsColumns = {
  employeeCount: count(),
  grossPay: sql<string>`coalesce(sum(${payrollRunEmployees.grossPay}), 0)::numeric(18,2)::text`,
  bpjsEmployer: sql<string>`coalesce(sum(${payrollRunEmployees.bpjsEmployer}), 0)::numeric(18,2)::text`,
  bpjsEmployee: sql<string>`coalesce(sum(${payrollRunEmployees.bpjsEmployee}), 0)::numeric(18,2)::text`,
  pph21: sql<string>`coalesce(sum(${payrollRunEmployees.pph21}), 0)::numeric(18,2)::text`,
  takeHomePay: sql<string>`coalesce(sum(${payrollRunEmployees.takeHomePay}), 0)::numeric(18,2)::text`,
};

function addTotals(items: readonly PayrollRunTotals[]): PayrollRunTotals {
  const add = (key: Exclude<keyof PayrollRunTotals, "employeeCount">): string =>
    items.reduce((total, item) => total.plus(item[key]), new Decimal(0)).toFixed(2);
  return {
    employeeCount: items.reduce((total, item) => total + item.employeeCount, 0),
    grossPay: add("grossPay"),
    bpjsEmployer: add("bpjsEmployer"),
    bpjsEmployee: add("bpjsEmployee"),
    pph21: add("pph21"),
    takeHomePay: add("takeHomePay"),
  };
}

// Laporan & ekspor payroll (feature 32) — owner/admin (peran dibaca ulang). Hanya periode final; angka dari snapshot
// karyawan dihitung (payroll_run_employees) sehingga total = jumlah slip. Ekspor transfer bank mendekripsi nomor
// rekening (data karyawan saat ekspor, bukan snapshot) dan tercatat di audit log.
@Injectable()
export class PayrollReportsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly attendance: AttendanceService,
    private readonly cipher: FieldCipher,
    private readonly audit: AuditService,
  ) {}

  // year null = tahun berjalan (zona waktu usaha)
  async report(user: AuthUser, requestedYear: number | null): Promise<PayrollReport> {
    const ctx = tenantContextOf(user);
    return withTenant(this.db, ctx, async (tx) => {
      await requireSalaryManager(tx, ctx);
      const year = requestedYear ?? Number(localClock(new Date(), await this.attendance.tenantTimeZone(tx, ctx.tenantId)).date.slice(0, 4));
      const yearRows = await tx
        .selectDistinct({ year: sql<number>`extract(year from ${payrollRuns.periodMonth})::int` })
        .from(payrollRuns)
        .where(eq(payrollRuns.status, "final"));
      const years = [...new Set([year, ...yearRows.map((row) => row.year)])].sort((a, b) => b - a);

      const runs = await tx
        .select({
          runId: payrollRuns.id,
          periodMonth: payrollRuns.periodMonth,
          periodStart: payrollRuns.periodStart,
          periodEnd: payrollRuns.periodEnd,
          payDate: sql<string | null>`${payrollRuns.snapshot}->>'payDate'`,
          finalizedAt: payrollRuns.finalizedAt,
          ...totalsColumns,
        })
        .from(payrollRuns)
        .innerJoin(payrollRunEmployees, and(eq(payrollRunEmployees.runId, payrollRuns.id), eq(payrollRunEmployees.status, "calculated")))
        .where(and(eq(payrollRuns.status, "final"), gte(payrollRuns.periodMonth, `${year}-01-01`), lt(payrollRuns.periodMonth, `${year + 1}-01-01`)))
        .groupBy(payrollRuns.id)
        .orderBy(asc(payrollRuns.periodMonth));

      const months = runs.flatMap((run): PayrollReportMonth[] =>
        run.periodStart && run.periodEnd && run.finalizedAt
          ? [
              {
                runId: run.runId,
                month: run.periodMonth.slice(0, 7),
                periodStart: run.periodStart,
                periodEnd: run.periodEnd,
                payDate: run.payDate,
                finalizedAt: run.finalizedAt.toISOString(),
                totals: {
                  employeeCount: run.employeeCount,
                  grossPay: run.grossPay,
                  bpjsEmployer: run.bpjsEmployer,
                  bpjsEmployee: run.bpjsEmployee,
                  pph21: run.pph21,
                  takeHomePay: run.takeHomePay,
                },
              },
            ]
          : [],
      );
      return { year, years, months, totals: addTotals(months.map((month) => month.totals)) };
    });
  }

  async transferFile(user: AuthUser, runId: string): Promise<ReportFile> {
    const ctx = tenantContextOf(user);
    return withTenant(this.db, ctx, async (tx) => {
      await requireSalaryManager(tx, ctx);
      const run = await this.findFinalRun(tx, runId);
      const rows = await tx
        .select({
          fullName: payrollRunEmployees.fullName,
          employeeNumber: payrollRunEmployees.employeeNumber,
          amount: payrollRunEmployees.takeHomePay,
          bankCode: employees.bankCode,
          bankAccount: employees.bankAccountEncrypted,
          accountHolder: employees.bankAccountHolder,
        })
        .from(payrollRunEmployees)
        .innerJoin(employees, eq(employees.id, payrollRunEmployees.employeeId))
        .where(and(eq(payrollRunEmployees.runId, run.id), eq(payrollRunEmployees.status, "calculated")))
        .orderBy(asc(payrollRunEmployees.fullName), asc(payrollRunEmployees.employeeId));
      // Nomor rekening terbuka di file → dicatat seperti reveal data sensitif
      await this.audit.record(tx, ctx, { entity: "payroll_run", entityId: run.id, action: "export_transfer", after: { rows: rows.length } });
      const buffer = await buildTransferWorkbook(
        rows.map((row) => ({
          fullName: row.fullName,
          employeeNumber: row.employeeNumber,
          bankCode: row.bankCode,
          accountNumber: row.bankAccount ? this.cipher.decrypt(row.bankAccount, { tenantId: ctx.tenantId, field: FIELD.bankAccount }) : null,
          accountHolder: row.accountHolder,
          amount: row.amount ?? "0",
        })),
      );
      return { buffer, fileName: `transfer-gaji-${run.periodMonth.slice(0, 7)}.xlsx` };
    });
  }

  async contributionsFile(user: AuthUser, runId: string): Promise<ReportFile> {
    const ctx = tenantContextOf(user);
    return withTenant(this.db, ctx, async (tx) => {
      await requireSalaryManager(tx, ctx);
      const run = await this.findFinalRun(tx, runId);
      const rows = await tx
        .select({ fullName: payrollRunEmployees.fullName, employeeNumber: payrollRunEmployees.employeeNumber, snapshot: payrollRunEmployees.snapshot })
        .from(payrollRunEmployees)
        .where(and(eq(payrollRunEmployees.runId, run.id), eq(payrollRunEmployees.status, "calculated")))
        .orderBy(asc(payrollRunEmployees.fullName), asc(payrollRunEmployees.employeeId));
      const buffer = await buildContributionsWorkbook(
        await this.periodInfo(tx, ctx, run),
        rows.map((row) => ({ fullName: row.fullName, employeeNumber: row.employeeNumber, snapshot: payrollEmployeeSnapshotSchema.parse(row.snapshot) })),
      );
      return { buffer, fileName: `rekap-setor-${run.periodMonth.slice(0, 7)}.xlsx` };
    });
  }

  private async periodInfo(tx: Transaction, ctx: TenantContext, run: FinalRun): Promise<PeriodInfo> {
    const [tenant] = await tx.select({ name: tenants.name }).from(tenants).where(eq(tenants.id, ctx.tenantId));
    return {
      companyName: tenant?.name ?? "",
      monthLabel: formatIdMonth(run.periodMonth.slice(0, 7)),
      rangeLabel: `${formatIdDate(run.periodStart)} – ${formatIdDate(run.periodEnd)}`,
      payDateLabel: run.payDate ? formatIdDate(run.payDate) : null,
    };
  }

  private async findFinalRun(tx: Transaction, runId: string): Promise<FinalRun> {
    const [run] = await tx
      .select({
        id: payrollRuns.id,
        periodMonth: payrollRuns.periodMonth,
        status: payrollRuns.status,
        periodStart: payrollRuns.periodStart,
        periodEnd: payrollRuns.periodEnd,
        payDate: sql<string | null>`${payrollRuns.snapshot}->>'payDate'`,
      })
      .from(payrollRuns)
      .where(eq(payrollRuns.id, runId));
    if (!run) throw new NotFoundException(RUN_NOT_FOUND);
    if (run.status !== "final" || !run.periodStart || !run.periodEnd) throw new ConflictException(NOT_FINAL);
    return { id: run.id, periodMonth: run.periodMonth, periodStart: run.periodStart, periodEnd: run.periodEnd, payDate: run.payDate };
  }
}

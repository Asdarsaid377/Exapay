import { employees, kpiReviewPeriods, kpiReviews, leaveRequests, taskLogs } from "@exapay/db";
import type { KpiScoreList, OwnerDashboard, SupervisorDashboard } from "@exapay/shared";
import { ForbiddenException, Inject, Injectable } from "@nestjs/common";
import { and, asc, count, eq, isNull, min, type SQL } from "drizzle-orm";
import { Decimal } from "decimal.js";

import { type AuthUser, tenantContextOf } from "../../common/auth/auth-user.js";
import { DRIZZLE } from "../../database/database.module.js";
import { type Database, type Transaction, withTenant } from "../../database/tenant-transaction.js";
import { AttendanceRecapService } from "../attendance/attendance-recap.service.js";
import { loadAttendanceViewer, viewerEmployeeScope } from "../attendance/attendance-viewer.js";
import { ComplianceService } from "../compliance/compliance.service.js";
import { KpiScoresService } from "../kpi/kpi-scores.service.js";
import { MinimumWageService } from "../payroll/minimum-wage.service.js";
import { PayrollRunsService } from "../payroll/payroll-runs.service.js";

// Dashboard owner/admin (feature 35, GET /dashboard). Angka diambil dari service halaman sumbernya agar selalu cocok:
// rekap harian periode berjalan (/attendance), skor KPI bulan berjalan (/kpi/scores), periode gaji terbaru (/payroll/:id),
// pengingat kepatuhan & upah minimum (/compliance). Hitungan tindakan tertunda memakai filter yang sama dengan tab
// Menunggu di /kpi/verification, /attendance/requests, dan status "reviewed" /kpi/reviews.
// Versi atasan (feature 36, GET /dashboard/team): service & filter yang sama dengan cakupan bawahan langsung.
@Injectable()
export class DashboardService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly recap: AttendanceRecapService,
    private readonly kpiScores: KpiScoresService,
    private readonly payrollRuns: PayrollRunsService,
    private readonly compliance: ComplianceService,
    private readonly minimumWages: MinimumWageService,
  ) {}

  async owner(user: AuthUser): Promise<OwnerDashboard> {
    const ctx = tenantContextOf(user);
    // Peran dibaca ulang dari DB (klaim JWT bisa basi) sebelum memuat bagian lain
    const local = await withTenant(this.db, ctx, async (tx) => {
      const viewer = await loadAttendanceViewer(tx, ctx);
      if (!viewer?.manage) throw new ForbiddenException("Dashboard ini hanya untuk pemilik atau admin");

      const statusRows = await tx
        .select({ status: employees.employmentStatus, total: count() })
        .from(employees)
        .where(isNull(employees.endDate))
        .groupBy(employees.employmentStatus);
      const byStatus = { permanent: 0, contract: 0, probation: 0 };
      for (const row of statusRows) byStatus[row.status] = row.total;

      const [reviewRow] = await tx.select({ total: count() }).from(kpiReviews).where(eq(kpiReviews.status, "reviewed"));

      return {
        employees: { active: byStatus.permanent + byStatus.contract + byStatus.probation, ...byStatus },
        taskLogs: await pendingTaskLogs(tx, undefined),
        leaveRequests: await pendingLeaveRequests(tx, undefined),
        kpiReviews: { count: reviewRow?.total ?? 0 },
        minimumWage: await this.minimumWages.summary(tx, ctx.tenantId),
      };
    });

    const [attendance, kpi, runList, compliance] = await Promise.all([
      this.recap.dailyRecap(user),
      this.kpiScores.list(user, {}),
      this.payrollRuns.list(user),
      this.compliance.upcoming(user),
    ]);
    // Terbaru dulu — periode yang dibuka paling akhir (tidak pernah setelah bulan payroll berjalan)
    const latest = runList.runs[0];
    const detail = latest ? await this.payrollRuns.detail(user, latest.id) : null;

    return {
      today: attendance.today,
      attendance,
      employees: local.employees,
      payroll:
        latest && detail
          ? {
              run: { ...latest, payDate: detail.payDate },
              employeeCount: detail.totals.employeeCount,
              grossPay: detail.totals.grossPay,
              bpjsEmployer: detail.totals.bpjsEmployer,
              cost: new Decimal(detail.totals.grossPay).plus(detail.totals.bpjsEmployer).toFixed(2),
            }
          : null,
      kpi: kpiSummary(kpi),
      pending: {
        taskLogs: local.taskLogs,
        leaveRequests: local.leaveRequests,
        kpiReviews: local.kpiReviews,
        payrollDrafts: runList.runs
          .filter((run) => run.status === "draft")
          .reverse()
          .map(({ id, month, periodStart, periodEnd }) => ({ id, month, periodStart, periodEnd })),
      },
      compliance,
      minimumWage: local.minimumWage,
    };
  }

  async team(user: AuthUser): Promise<SupervisorDashboard> {
    const ctx = tenantContextOf(user);
    const local = await withTenant(this.db, ctx, async (tx) => {
      const viewer = await loadAttendanceViewer(tx, ctx);
      if (viewer?.role !== "atasan") throw new ForbiddenException("Dashboard ini hanya untuk atasan");
      // Bawahan langsung; atasan tanpa data karyawan tertaut → sql`false` (semua nol)
      const scope = viewerEmployeeScope(viewer);

      const [teamRow] = await tx
        .select({ total: count() })
        .from(employees)
        .where(and(scope, isNull(employees.endDate)));
      // = jumlah draft per periode di /kpi/reviews (cakupan bawahan)
      const [reviewRow] = await tx
        .select({ total: count() })
        .from(kpiReviews)
        .innerJoin(employees, eq(employees.id, kpiReviews.employeeId))
        .where(and(scope, eq(kpiReviews.status, "draft")));
      const [oldestPeriod] = await tx
        .select({ id: kpiReviewPeriods.id })
        .from(kpiReviews)
        .innerJoin(employees, eq(employees.id, kpiReviews.employeeId))
        .innerJoin(kpiReviewPeriods, eq(kpiReviewPeriods.id, kpiReviews.periodId))
        .where(and(scope, eq(kpiReviews.status, "draft")))
        .orderBy(asc(kpiReviewPeriods.startDate))
        .limit(1);

      return {
        linked: viewer.ownEmployeeId !== null,
        team: { active: teamRow?.total ?? 0 },
        taskLogs: await pendingTaskLogs(tx, scope),
        leaveRequests: await pendingLeaveRequests(tx, scope),
        kpiReviews: { count: reviewRow?.total ?? 0, periodId: oldestPeriod?.id ?? null },
      };
    });

    const [attendance, kpi] = await Promise.all([this.recap.dailyRecap(user), this.kpiScores.list(user, {})]);
    return {
      today: attendance.today,
      linked: local.linked,
      team: local.team,
      attendance,
      kpi: kpiSummary(kpi),
      pending: { taskLogs: local.taskLogs, leaveRequests: local.leaveRequests, kpiReviews: local.kpiReviews },
    };
  }
}

// Tab Menunggu /kpi/verification (scope undefined = semua karyawan)
async function pendingTaskLogs(tx: Transaction, scope: SQL | undefined): Promise<SupervisorDashboard["pending"]["taskLogs"]> {
  const [row] = await tx
    .select({ total: count(), oldest: min(taskLogs.workDate) })
    .from(taskLogs)
    .innerJoin(employees, eq(employees.id, taskLogs.employeeId))
    .where(and(scope, eq(taskLogs.status, "pending")));
  return { count: row?.total ?? 0, oldestWorkDate: row?.oldest ?? null };
}

// Tab Menunggu /attendance/requests per jenis
async function pendingLeaveRequests(tx: Transaction, scope: SQL | undefined): Promise<SupervisorDashboard["pending"]["leaveRequests"]> {
  const rows = await tx
    .select({ type: leaveRequests.type, total: count() })
    .from(leaveRequests)
    .innerJoin(employees, eq(employees.id, leaveRequests.employeeId))
    .where(and(scope, eq(leaveRequests.status, "pending")))
    .groupBy(leaveRequests.type);
  const leaves = { permit: 0, sick: 0, leave: 0 };
  for (const row of rows) leaves[row.type] = row.total;
  return { count: leaves.permit + leaves.sick + leaves.leave, ...leaves };
}

function kpiSummary(kpi: KpiScoreList): OwnerDashboard["kpi"] {
  return {
    from: kpi.from,
    to: kpi.to,
    scoredCount: Object.values(kpi.predicateCounts).reduce((sum, n) => sum + n, 0),
    averageScore: kpi.averageScore,
    averagePredicate: kpi.averagePredicate,
    predicateCounts: kpi.predicateCounts,
  };
}

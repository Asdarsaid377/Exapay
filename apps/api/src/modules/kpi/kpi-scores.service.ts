import { departments, employees, kpiIndicators, kpiTemplates, positions } from "@exapay/db";
import {
  type AttendanceHistoryQuery,
  type EmployeeKpiScore,
  type KpiPredicate,
  type KpiScoreList,
  type KpiScoreQuery,
  type KpiScoreResult,
  type KpiScoreRow,
  type MyKpiScore,
} from "@exapay/shared";
import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, asc, eq, gte, inArray, isNull, lte, or, type SQL } from "drizzle-orm";

import { type AuthUser, tenantContextOf } from "../../common/auth/auth-user.js";
import { DRIZZLE } from "../../database/database.module.js";
import { type Database, type Transaction, withTenant } from "../../database/tenant-transaction.js";
import { localClock, monthRange } from "../attendance/attendance-clock.js";
import { type Period, resolvePeriod, AttendanceRecapService } from "../attendance/attendance-recap.service.js";
import { loadAttendanceViewer, viewerEmployeeScope } from "../attendance/attendance-viewer.js";
import { addDays } from "../attendance/shift-roster.js";
import { AttendanceService } from "../attendance/attendance.service.js";
import { WorkCalendarService } from "../attendance/work-calendar.service.js";
import { verifiedTaskTotals } from "../tasks/verified-task-totals.js";
import { averageScore, kpiPredicate, kpiScore, type ScoreIndicator } from "./kpi-score.js";

const PERIOD_NOT_STARTED = "Periode belum dimulai. Pilih tanggal mulai paling lambat hari ini.";

export type ScoredEmployee = {
  id: string;
  joinDate: string;
  endDate: string | null;
  templateId: string | null;
  templateName: string | null;
};

type EmployeeRow = ScoredEmployee & {
  fullName: string;
  positionName: string;
  departmentId: string;
  departmentName: string;
};

export type Scored = { template: { id: string; name: string } | null; result: KpiScoreResult | null };

const employeeColumns = {
  id: employees.id,
  fullName: employees.fullName,
  joinDate: employees.joinDate,
  endDate: employees.endDate,
  positionName: positions.name,
  departmentId: departments.id,
  departmentName: departments.name,
  templateId: kpiTemplates.id,
  templateName: kpiTemplates.name,
};

// Skor KPI ad-hoc (feature 21): dihitung saat dibaca (tidak disimpan) dari template KPI jabatan saat ini,
// catatan tugas terverifikasi, dan rekap absensi. /kpi/scores: owner/admin semua karyawan, atasan bawahan langsung;
// /kpi/scores/me: milik sendiri (portal /me/performance). Rumus di kpi-score.ts.
@Injectable()
export class KpiScoresService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly attendance: AttendanceService,
    private readonly recap: AttendanceRecapService,
    private readonly workCalendar: WorkCalendarService,
  ) {}

  async list(user: AuthUser, query: KpiScoreQuery): Promise<KpiScoreList> {
    const ctx = tenantContextOf(user);
    return withTenant(this.db, ctx, async (tx) => {
      // Peran dibaca ulang dari DB; karyawan / bukan anggota → null
      const viewer = await loadAttendanceViewer(tx, ctx);
      if (!viewer) throw new ForbiddenException("Anda tidak memiliki akses ke skor KPI");
      const timeZone = await this.attendance.tenantTimeZone(tx, ctx.tenantId);
      const today = localClock(new Date(), timeZone).date;
      const requested = resolvePeriod(query, today);
      if (requested.from > today) throw new BadRequestException(PERIOD_NOT_STARTED);
      const period: Period = { from: requested.from, to: requested.to > today ? today : requested.to };

      // Karyawan yang masa kerjanya beririsan dengan periode (seperti rekap absensi)
      const visible = await this.selectEmployees(
        tx,
        and(viewerEmployeeScope(viewer), lte(employees.joinDate, period.to), or(isNull(employees.endDate), gte(employees.endDate, period.from))),
      );
      const departmentOptions = new Map(visible.map((row) => [row.departmentId, row.departmentName]));
      const departmentId = query.departmentId && departmentOptions.has(query.departmentId) ? query.departmentId : null;
      const rows = departmentId ? visible.filter((row) => row.departmentId === departmentId) : visible;

      const scored = await this.scoreEmployees(tx, rows, period, today);
      const scoreRows: KpiScoreRow[] = rows.map((row) => {
        const { template, result } = scored.get(row.id) ?? { template: null, result: null };
        return {
          employee: {
            id: row.id,
            fullName: row.fullName,
            positionName: row.positionName,
            departmentId: row.departmentId,
            departmentName: row.departmentName,
            endDate: row.endDate,
          },
          template,
          result,
        };
      });

      const predicateCounts: Record<KpiPredicate, number> = { very_good: 0, good: 0, fair: 0, needs_improvement: 0 };
      const scores: string[] = [];
      for (const { result } of scoreRows) {
        if (!result?.score || !result.predicate) continue;
        scores.push(result.score);
        predicateCounts[result.predicate] += 1;
      }

      const average = averageScore(scores);
      return {
        from: period.from,
        to: period.to,
        requestedTo: requested.to,
        today,
        scope: viewer.manage ? "all" : "subordinates",
        departmentId,
        departments: [...departmentOptions].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, "id")),
        averageScore: average,
        averagePredicate: average ? kpiPredicate(average) : null,
        predicateCounts,
        rows: scoreRows,
      };
    });
  }

  // Skor milik sendiri per bulan (portal). Semua peran yang akunnya tertaut data karyawan.
  async mine(user: AuthUser, query: AttendanceHistoryQuery): Promise<MyKpiScore> {
    const ctx = tenantContextOf(user);
    return withTenant(this.db, ctx, async (tx) => {
      const timeZone = await this.attendance.tenantTimeZone(tx, ctx.tenantId);
      const today = localClock(new Date(), timeZone).date;
      const currentMonth = today.slice(0, 7);
      const month = query.month && query.month < currentMonth ? query.month : currentMonth;
      const range = monthRange(month);
      const period: Period = { from: range.from, to: range.to > today ? today : range.to };

      const own = await this.attendance.ownEmployee(tx, user.userId);
      const base = { access: this.attendance.accessOf(own, today), month, currentMonth, ...period, today };
      if (!own) return { ...base, template: null, result: null };

      const [row] = await this.selectEmployees(tx, eq(employees.id, own.id));
      if (!row) return { ...base, template: null, result: null };
      // Bulan di luar masa kerja → skor kosong (recap menandai not_employed, tanpa hari target)
      const scored = (await this.scoreEmployees(tx, [row], period, today)).get(row.id);
      return { ...base, template: scored?.template ?? null, result: scored?.result ?? null };
    });
  }

  // Skor satu karyawan per bulan kalender (tab KPI detail karyawan, feature 37b) — periode & rumus sama dengan mine().
  // Di luar cakupan penglihat (atasan: bukan bawahan langsung) → 404, tidak membocorkan keberadaan karyawan.
  async employeeScore(user: AuthUser, employeeId: string, query: AttendanceHistoryQuery): Promise<EmployeeKpiScore> {
    const ctx = tenantContextOf(user);
    return withTenant(this.db, ctx, async (tx) => {
      const viewer = await loadAttendanceViewer(tx, ctx);
      if (!viewer) throw new ForbiddenException("Anda tidak memiliki akses ke skor KPI");
      const [row] = await this.selectEmployees(tx, and(eq(employees.id, employeeId), viewerEmployeeScope(viewer)));
      if (!row) throw new NotFoundException("Karyawan tidak ditemukan");

      const timeZone = await this.attendance.tenantTimeZone(tx, ctx.tenantId);
      const today = localClock(new Date(), timeZone).date;
      const currentMonth = today.slice(0, 7);
      const month = query.month && query.month < currentMonth ? query.month : currentMonth;
      const range = monthRange(month);
      const period: Period = { from: range.from, to: range.to > today ? today : range.to };
      const scored = (await this.scoreEmployees(tx, [row], period, today)).get(row.id);
      return { month, currentMonth, ...period, today, template: scored?.template ?? null, result: scored?.result ?? null };
    });
  }

  // ——— helper ———

  private selectEmployees(tx: Transaction, where: SQL | undefined): Promise<EmployeeRow[]> {
    return tx
      .select(employeeColumns)
      .from(employees)
      .innerJoin(positions, eq(positions.id, employees.positionId))
      .innerJoin(departments, eq(departments.id, employees.departmentId))
      .leftJoin(kpiTemplates, eq(kpiTemplates.id, positions.kpiTemplateId))
      .where(where)
      .orderBy(asc(employees.fullName));
  }

  // Dipakai ulang penilaian periodik (feature 22) dengan nilai atasan per karyawan (id karyawan → id indikator → nilai)
  async scoreEmployees(
    tx: Transaction,
    rows: readonly ScoredEmployee[],
    period: Period,
    today: string,
    ratings: ReadonlyMap<string, ReadonlyMap<string, number>> = new Map(),
  ): Promise<Map<string, Scored>> {
    const withTemplate = rows.filter((row) => row.templateId !== null);
    const scored = new Map<string, Scored>(rows.map((row) => [row.id, { template: null, result: null }]));
    if (withTemplate.length === 0) return scored;

    const templateIds = [...new Set(withTemplate.flatMap((row) => (row.templateId ? [row.templateId] : [])))];
    const indicatorRows = await tx
      .select({
        id: kpiIndicators.id,
        templateId: kpiIndicators.templateId,
        name: kpiIndicators.name,
        type: kpiIndicators.type,
        unit: kpiIndicators.unit,
        target: kpiIndicators.target,
        targetPeriod: kpiIndicators.targetPeriod,
        systemMetric: kpiIndicators.systemMetric,
        weight: kpiIndicators.weight,
      })
      .from(kpiIndicators)
      .where(inArray(kpiIndicators.templateId, templateIds))
      .orderBy(asc(kpiIndicators.sortOrder));
    const indicatorsOf = (templateId: string): ScoreIndicator[] => indicatorRows.filter((indicator) => indicator.templateId === templateId);

    // Kalender mencakup bulan penuh: pembagi target bulanan = hari kerja sebulan. Roster karyawan mode shift (feature 47)
    // dimuat ±6 hari di luar bulan agar minggu Sen–Min di tepi bulan lengkap untuk pembagi mingguan.
    const calendarRange = { from: addDays(monthRange(period.from.slice(0, 7)).from, -6), to: addDays(monthRange(period.to.slice(0, 7)).to, 6) };
    const calendar = await this.workCalendar.loadCalendar(tx, calendarRange.from, calendarRange.to);
    const recaps = await this.recap.recapEmployees(tx, withTemplate, period, today, calendar, calendarRange);
    const totals = await verifiedTaskTotals(
      tx,
      withTemplate.map((row) => row.id),
      period.from,
      period.to,
    );

    for (const row of withTemplate) {
      const recap = recaps.get(row.id);
      if (!row.templateId || !row.templateName || !recap) continue;
      const actuals = new Map(totals.filter((total) => total.employeeId === row.id).map((total) => [total.indicatorId, total.total]));
      scored.set(row.id, {
        template: { id: row.templateId, name: row.templateName },
        // Nilai atasan hanya ada di penilaian periodik (feature 22) — skor ad-hoc selalu "belum dinilai"
        result: kpiScore({ calendar: recap.calendar, days: recap.days, indicators: indicatorsOf(row.templateId), actuals, ratings: ratings.get(row.id) ?? new Map() }),
      });
    }
    return scored;
  }
}

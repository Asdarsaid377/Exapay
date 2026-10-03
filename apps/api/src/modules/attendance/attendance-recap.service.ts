import { attendanceCorrections, attendanceRecords, departments, employees, leaveRequests, positions } from "@exapay/db";
import type {
  AttendanceDailyCount,
  AttendanceDailyRecap,
  AttendanceDay,
  AttendanceDayStatus,
  AttendanceHistory,
  AttendancePeriodQuery,
  AttendanceRecap,
  EmployeeAttendanceDays,
  GeofenceStatus,
  LeaveType,
} from "@exapay/shared";
import { ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, asc, between, eq, gte, inArray, isNull, lte, or, type SQL } from "drizzle-orm";

import { type AuthUser, tenantContextOf } from "../../common/auth/auth-user.js";
import { DRIZZLE } from "../../database/database.module.js";
import { type Database, type TenantContext, type Transaction, withTenant } from "../../database/tenant-transaction.js";
import { localClock, monthRange } from "./attendance-clock.js";
import { type RecapEmployment, type RecapLeave, type RecapRecord, type RecapResult, recapEmployee } from "./attendance-recap.js";
import { type AttendanceViewer, loadAttendanceViewer, viewerCanSee, viewerEmployeeScope } from "./attendance-viewer.js";
import { payrollMonthOf } from "./attendance-period.js";
import { AttendancePeriodsService } from "./attendance-periods.service.js";
import { AttendanceService, geofenceOf, selfieStateOf } from "./attendance.service.js";
import { rosterEntryOf } from "./shift-roster.js";
import { countWorkingDays, type WorkCalendar } from "./work-calendar.js";
import { WorkCalendarService } from "./work-calendar.service.js";

export type Period = { from: string; to: string };

// Rekap + kalender kerja karyawan itu (mode shift: roster) — pembagi target KPI memakai kalender yang sama
export type EmployeeRecap = RecapResult & { calendar: WorkCalendar };

const NOT_FOUND = "Karyawan tidak ditemukan";

const DAY_MS = 86_400_000;

// Status harian → kolom hitungan dashboard; null = bukan hari kerja dalam masa kerja (tidak dihitung)
const DAILY_STATUS_KEYS: Record<AttendanceDayStatus, keyof Omit<AttendanceDailyCount, "date" | "expected"> | null> = {
  on_time: "onTime",
  late: "late",
  permit: "leave",
  sick: "leave",
  leave: "leave",
  absent: "absent",
  pending: "pending",
  off_day_present: null,
  off: null,
  not_employed: null,
};

function datesOf(period: Period): string[] {
  const dates: string[] = [];
  for (let ms = Date.parse(`${period.from}T00:00:00Z`), end = Date.parse(`${period.to}T00:00:00Z`); ms <= end; ms += DAY_MS) {
    dates.push(new Date(ms).toISOString().slice(0, 10));
  }
  return dates;
}

const employeeColumns = {
  id: employees.id,
  fullName: employees.fullName,
  positionName: positions.name,
  departmentName: departments.name,
  joinDate: employees.joinDate,
  endDate: employees.endDate,
  supervisorId: employees.supervisorId,
};

type EmployeeRow = {
  id: string;
  fullName: string;
  positionName: string;
  departmentName: string;
  joinDate: string;
  endDate: string | null;
  supervisorId: string | null;
};

type RecordRow = {
  id: string;
  employeeId: string;
  workDate: string;
  checkInAt: Date;
  checkOutAt: Date | null;
  lateMinutes: number;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  checkInSelfieKey: string | null;
  checkInSelfieType: string | null;
  checkOutSelfieKey: string | null;
  checkOutSelfieType: string | null;
  checkInGeofence: GeofenceStatus | null;
  checkInDistanceM: number | null;
  checkInLocationName: string | null;
  checkInAccuracy: number | null;
  checkOutGeofence: GeofenceStatus | null;
  checkOutDistanceM: number | null;
  checkOutLocationName: string | null;
  checkOutAccuracy: number | null;
  shiftName: string | null;
  unscheduled: boolean;
};

type LeaveRow = RecapLeave & { employeeId: string };

// Periode dari query: rentang bebas, bulan kalender, atau bulan berjalan (tanggal hari ini di zona waktu usaha).
// Dipakai skor KPI; rekap absensi memakai periode tutup buku payroll (AttendanceRecapService.recapPeriod).
export function resolvePeriod(query: AttendancePeriodQuery, today: string): Period {
  if (query.from && query.to) return { from: query.from, to: query.to };
  return monthRange(query.month ?? today.slice(0, 7));
}

function toEmployee(row: EmployeeRow): EmployeeAttendanceDays["employee"] {
  return { id: row.id, fullName: row.fullName, positionName: row.positionName, departmentName: row.departmentName, joinDate: row.joinDate, endDate: row.endDate };
}

function toRecapRecord(row: RecordRow): RecapRecord {
  return { workDate: row.workDate, lateMinutes: row.lateMinutes, hasCheckOut: row.checkOutAt !== null };
}

// Rekap absensi per periode (feature 16): owner/admin semua karyawan, atasan bawahan langsung.
// Status harian dihitung saat dibaca dari absen + izin disetujui + kalender kerja (fungsi murni attendance-recap.ts).
@Injectable()
export class AttendanceRecapService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly attendance: AttendanceService,
    private readonly workCalendar: WorkCalendarService,
    private readonly periods: AttendancePeriodsService,
  ) {}

  async recap(user: AuthUser, query: AttendancePeriodQuery): Promise<AttendanceRecap> {
    const ctx = tenantContextOf(user);
    return withTenant(this.db, ctx, async (tx) => {
      const { viewer, timeZone, today, month, currentMonth, cutoffDay, period, calendar, employees: recapped } = await this.loadRecap(tx, ctx, query);
      return {
        ...period,
        month,
        currentMonth,
        cutoffDay,
        today,
        timeZone,
        scope: viewer.manage ? "all" : "subordinates",
        workingDays: countWorkingDays(calendar, period.from, period.to),
        rows: recapped.map(({ row, result }) => ({ employee: toEmployee(row), summary: result.summary })),
      };
    });
  }

  // Jumlah karyawan per status per tanggal pada periode berjalan (dashboard feature 35) — cakupan & angka sama dengan recap()
  async dailyRecap(user: AuthUser): Promise<AttendanceDailyRecap> {
    const ctx = tenantContextOf(user);
    return withTenant(this.db, ctx, async (tx) => {
      const { today, month, currentMonth, period, employees: recapped } = await this.loadRecap(tx, ctx, {});
      const byDate = new Map<string, AttendanceDailyCount>();
      for (const { result } of recapped) {
        for (const { date, status } of result.days) {
          const day = byDate.get(date) ?? { date, expected: 0, onTime: 0, late: 0, leave: 0, absent: 0, pending: 0 };
          byDate.set(date, day);
          const key = DAILY_STATUS_KEYS[status];
          if (!key) continue;
          day.expected += 1;
          day[key] += 1;
        }
      }
      const totals = { present: 0, late: 0, leave: 0, absent: 0 };
      for (const { result } of recapped) {
        const { summary } = result;
        totals.present += summary.present;
        totals.late += summary.late;
        totals.leave += summary.permit + summary.sick + summary.leave;
        totals.absent += summary.absent;
      }
      return {
        month: month ?? currentMonth,
        ...period,
        today,
        employeeCount: recapped.length,
        days: datesOf(period).map((date) => byDate.get(date) ?? { date, expected: 0, onTime: 0, late: 0, leave: 0, absent: 0, pending: 0 }),
        totals,
      };
    });
  }

  // Rincian harian satu karyawan (halaman koreksi). Karyawan di luar cakupan penglihat → 404.
  async employeeDays(user: AuthUser, employeeId: string, query: AttendancePeriodQuery): Promise<EmployeeAttendanceDays> {
    const ctx = tenantContextOf(user);
    return withTenant(this.db, ctx, async (tx) => {
      const viewer = await this.requireViewer(tx, ctx);
      const [row] = await this.selectEmployees(tx, eq(employees.id, employeeId));
      if (!row || !viewerCanSee(viewer, row.supervisorId)) throw new NotFoundException(NOT_FOUND);

      const timeZone = await this.attendance.tenantTimeZone(tx, ctx.tenantId);
      const today = localClock(new Date(), timeZone).date;
      const { from, to, month, currentMonth } = await this.recapPeriod(tx, ctx, query, today);
      const period = { from, to };
      const records = await this.selectRecords(tx, [row.id], period);
      const calendar = await this.workCalendar.loadCalendar(tx, period.from, period.to);
      const result = (await this.recapEmployees(tx, [row], period, today, calendar)).get(row.id);
      if (!result) throw new Error("[attendance-recap] rekap karyawan hilang");
      const [shiftMode] = await this.workCalendar.shiftModeEmployeeIds(tx, [row.id]);
      // Mode shift: isi roster per hari untuk ditampilkan (Pagi 07–15 / Libur)
      const rosterRows = shiftMode ? await this.workCalendar.rosterRows(tx, [row.id], period.from, period.to) : [];
      const rosterByDate = new Map(rosterRows.map((r) => [r.workDate, r]));
      const corrected = await tx
        .selectDistinct({ workDate: attendanceCorrections.workDate })
        .from(attendanceCorrections)
        .where(and(eq(attendanceCorrections.employeeId, row.id), between(attendanceCorrections.workDate, period.from, period.to)));
      const correctedDates = new Set(corrected.map((c) => c.workDate));
      const recordByDate = new Map(records.map((r) => [r.workDate, r]));

      const days: AttendanceDay[] = result.days.map((day) => {
        const record = recordByDate.get(day.date);
        const roster = rosterByDate.get(day.date);
        return {
          ...day,
          record: record
            ? {
                id: record.id,
                checkInAt: record.checkInAt.toISOString(),
                checkOutAt: record.checkOutAt ? record.checkOutAt.toISOString() : null,
                lateMinutes: record.lateMinutes,
                // Kolom `time` dibaca "08:00:00" → "08:00"
                scheduledStart: record.scheduledStart ? record.scheduledStart.slice(0, 5) : null,
                scheduledEnd: record.scheduledEnd ? record.scheduledEnd.slice(0, 5) : null,
                checkInSelfie: selfieStateOf(record.checkInSelfieKey, record.checkInSelfieType),
                checkOutSelfie: selfieStateOf(record.checkOutSelfieKey, record.checkOutSelfieType),
                checkInGeofence: geofenceOf(record.checkInGeofence, record.checkInDistanceM, record.checkInLocationName, record.checkInAccuracy),
                checkOutGeofence: geofenceOf(record.checkOutGeofence, record.checkOutDistanceM, record.checkOutLocationName, record.checkOutAccuracy),
                shiftName: record.shiftName,
                unscheduled: record.unscheduled,
              }
            : null,
          shift: roster ? rosterEntryOf(roster) : null,
          corrected: correctedDates.has(day.date),
        };
      });
      return {
        employee: toEmployee(row),
        ...period,
        month,
        currentMonth,
        today,
        timeZone,
        scheduleMode: shiftMode ? "shift" : "business",
        summary: result.summary,
        days,
        canCorrect: viewer.manage && row.id !== viewer.ownEmployeeId,
      };
    });
  }

  // Rekap per karyawan untuk modul lain (skor KPI feature 21) di dalam transaksi ber-tenant pemanggil — cakupan penglihat dicek pemanggil.
  // `calendar` = kalender usaha; karyawan mode shift memakai roster (feature 47) dalam `calendarRange` (default periode —
  // skor KPI memakai bulan penuh untuk pembagi target bulanan).
  async recapEmployees(
    tx: Transaction,
    rows: readonly (RecapEmployment & { id: string })[],
    period: Period,
    today: string,
    calendar: WorkCalendar,
    calendarRange: Period = period,
  ): Promise<Map<string, EmployeeRecap>> {
    const ids = rows.map((row) => row.id);
    const records = await this.selectRecords(tx, ids, period);
    const leaves = await this.selectLeaves(tx, ids, period);
    const calendars = await this.workCalendar.employeeCalendars(tx, calendar, ids, calendarRange.from, calendarRange.to);
    return new Map(
      rows.map((row) => {
        const own = calendars.get(row.id) ?? calendar;
        const result = recapEmployee({
          calendar: own,
          ...period,
          today,
          employment: row,
          records: records.filter((r) => r.employeeId === row.id).map(toRecapRecord),
          leaves: leaves.filter((l) => l.employeeId === row.id),
        });
        return [row.id, { ...result, calendar: own }];
      }),
    );
  }

  // Riwayat absensi milik sendiri + jumlah alpa bulan itu (portal /me & /me/attendance, feature 37) — angka alpa sama
  // dengan rekap absensi (recapEmployee). Hari kerja hari ini & sesudahnya belum dihitung alpa.
  async myHistory(user: AuthUser, month: string | undefined): Promise<AttendanceHistory> {
    const history = await this.attendance.history(user, month);
    const ctx = tenantContextOf(user);
    const absent = await withTenant(this.db, ctx, async (tx) => {
      const own = await this.attendance.ownEmployee(tx, user.userId);
      if (!own) return 0;
      const today = localClock(new Date(), history.timeZone).date;
      const period = monthRange(history.month);
      const calendar = await this.workCalendar.loadCalendar(tx, period.from, period.to);
      const result = (await this.recapEmployees(tx, [own], period, today, calendar)).get(own.id);
      return result?.summary.absent ?? 0;
    });
    return { ...history, summary: { ...history.summary, absent } };
  }

  // ——— helper ———

  // Periode (rentang bebas / tutup buku) + rekap per karyawan yang masa kerjanya beririsan, dalam cakupan penglihat
  private async loadRecap(tx: Transaction, ctx: TenantContext, query: AttendancePeriodQuery) {
    const viewer = await this.requireViewer(tx, ctx);
    const timeZone = await this.attendance.tenantTimeZone(tx, ctx.tenantId);
    const today = localClock(new Date(), timeZone).date;
    const { month, currentMonth, cutoffDay, ...period } = await this.recapPeriod(tx, ctx, query, today);
    const rows = await this.selectEmployees(
      tx,
      and(viewerEmployeeScope(viewer), lte(employees.joinDate, period.to), or(isNull(employees.endDate), gte(employees.endDate, period.from))),
    );
    const calendar = await this.workCalendar.loadCalendar(tx, period.from, period.to);
    const results = await this.recapEmployees(tx, rows, period, today, calendar);
    const recapped = rows.map((row) => {
      const result = results.get(row.id);
      if (!result) throw new Error("[attendance-recap] rekap karyawan hilang");
      return { row, result };
    });
    return { viewer, timeZone, today, month, currentMonth, cutoffDay, period, calendar, employees: recapped };
  }

  // Rentang bebas, atau periode tutup buku payroll bulan terpilih (feature 30b); tanpa bulan = periode yang memuat hari ini
  private async recapPeriod(
    tx: Transaction,
    ctx: TenantContext,
    query: AttendancePeriodQuery,
    today: string,
  ): Promise<Period & { month: string | null; currentMonth: string; cutoffDay: number | null }> {
    const cutoffDay = await this.periods.cutoffDay(tx, ctx);
    const currentMonth = payrollMonthOf(today, cutoffDay);
    if (query.from && query.to) return { from: query.from, to: query.to, month: null, currentMonth, cutoffDay };
    const month = query.month ?? currentMonth;
    const { from, to } = await this.periods.payrollPeriod(tx, ctx, month);
    return { from, to, month, currentMonth, cutoffDay };
  }

  private async requireViewer(tx: Transaction, ctx: TenantContext): Promise<AttendanceViewer> {
    const viewer = await loadAttendanceViewer(tx, ctx);
    if (!viewer) throw new ForbiddenException("Anda tidak memiliki akses ke rekap absensi");
    return viewer;
  }

  private selectEmployees(tx: Transaction, where: SQL | undefined): Promise<EmployeeRow[]> {
    return tx
      .select(employeeColumns)
      .from(employees)
      .innerJoin(positions, eq(positions.id, employees.positionId))
      .innerJoin(departments, eq(departments.id, employees.departmentId))
      .where(where)
      .orderBy(asc(employees.fullName));
  }

  private async selectRecords(tx: Transaction, employeeIds: string[], period: Period): Promise<RecordRow[]> {
    if (employeeIds.length === 0) return [];
    return tx
      .select({
        id: attendanceRecords.id,
        employeeId: attendanceRecords.employeeId,
        workDate: attendanceRecords.workDate,
        checkInAt: attendanceRecords.checkInAt,
        checkOutAt: attendanceRecords.checkOutAt,
        lateMinutes: attendanceRecords.lateMinutes,
        scheduledStart: attendanceRecords.scheduledStart,
        scheduledEnd: attendanceRecords.scheduledEnd,
        checkInSelfieKey: attendanceRecords.checkInSelfieKey,
        checkInSelfieType: attendanceRecords.checkInSelfieType,
        checkOutSelfieKey: attendanceRecords.checkOutSelfieKey,
        checkOutSelfieType: attendanceRecords.checkOutSelfieType,
        checkInGeofence: attendanceRecords.checkInGeofence,
        checkInDistanceM: attendanceRecords.checkInDistanceM,
        checkInLocationName: attendanceRecords.checkInLocationName,
        checkInAccuracy: attendanceRecords.checkInAccuracy,
        checkOutGeofence: attendanceRecords.checkOutGeofence,
        checkOutDistanceM: attendanceRecords.checkOutDistanceM,
        checkOutLocationName: attendanceRecords.checkOutLocationName,
        checkOutAccuracy: attendanceRecords.checkOutAccuracy,
        shiftName: attendanceRecords.shiftName,
        unscheduled: attendanceRecords.unscheduled,
      })
      .from(attendanceRecords)
      .where(and(inArray(attendanceRecords.employeeId, employeeIds), between(attendanceRecords.workDate, period.from, period.to)));
  }

  // Hanya pengajuan disetujui yang beririsan dengan periode
  private async selectLeaves(tx: Transaction, employeeIds: string[], period: Period): Promise<LeaveRow[]> {
    if (employeeIds.length === 0) return [];
    const rows: { employeeId: string; type: LeaveType; startDate: string; endDate: string }[] = await tx
      .select({ employeeId: leaveRequests.employeeId, type: leaveRequests.type, startDate: leaveRequests.startDate, endDate: leaveRequests.endDate })
      .from(leaveRequests)
      .where(
        and(
          inArray(leaveRequests.employeeId, employeeIds),
          eq(leaveRequests.status, "approved"),
          lte(leaveRequests.startDate, period.to),
          gte(leaveRequests.endDate, period.from),
        ),
      );
    return rows;
  }
}

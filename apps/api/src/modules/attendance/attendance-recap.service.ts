import { attendanceCorrections, attendanceRecords, departments, employees, leaveRequests, positions } from "@exapay/db";
import type { AttendanceDay, AttendancePeriodQuery, AttendanceRecap, EmployeeAttendanceDays, LeaveType } from "@exapay/shared";
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
import { AttendanceService } from "./attendance.service.js";
import { countWorkingDays, type WorkCalendar } from "./work-calendar.js";
import { WorkCalendarService } from "./work-calendar.service.js";

export type Period = { from: string; to: string };

const NOT_FOUND = "Karyawan tidak ditemukan";

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
  employeeId: string;
  workDate: string;
  checkInAt: Date;
  checkOutAt: Date | null;
  lateMinutes: number;
  scheduledStart: string | null;
  scheduledEnd: string | null;
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
      const viewer = await this.requireViewer(tx, ctx);
      const timeZone = await this.attendance.tenantTimeZone(tx, ctx.tenantId);
      const today = localClock(new Date(), timeZone).date;
      const { month, currentMonth, cutoffDay, ...period } = await this.recapPeriod(tx, ctx, query, today);

      // Karyawan yang masa kerjanya beririsan dengan periode
      const rows = await this.selectEmployees(
        tx,
        and(viewerEmployeeScope(viewer), lte(employees.joinDate, period.to), or(isNull(employees.endDate), gte(employees.endDate, period.from))),
      );
      const ids = rows.map((row) => row.id);
      const records = await this.selectRecords(tx, ids, period);
      const leaves = await this.selectLeaves(tx, ids, period);
      const calendar = await this.workCalendar.loadCalendar(tx, period.from, period.to);

      return {
        ...period,
        month,
        currentMonth,
        cutoffDay,
        today,
        timeZone,
        scope: viewer.manage ? "all" : "subordinates",
        workingDays: countWorkingDays(calendar, period.from, period.to),
        rows: rows.map((row) => ({
          employee: toEmployee(row),
          summary: recapEmployee({
            calendar,
            ...period,
            today,
            employment: row,
            records: records.filter((r) => r.employeeId === row.id).map(toRecapRecord),
            leaves: leaves.filter((l) => l.employeeId === row.id),
          }).summary,
        })),
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
      const { from, to } = await this.recapPeriod(tx, ctx, query, today);
      const period = { from, to };
      const records = await this.selectRecords(tx, [row.id], period);
      const leaves = await this.selectLeaves(tx, [row.id], period);
      const calendar = await this.workCalendar.loadCalendar(tx, period.from, period.to);
      const corrected = await tx
        .selectDistinct({ workDate: attendanceCorrections.workDate })
        .from(attendanceCorrections)
        .where(and(eq(attendanceCorrections.employeeId, row.id), between(attendanceCorrections.workDate, period.from, period.to)));
      const correctedDates = new Set(corrected.map((c) => c.workDate));
      const recordByDate = new Map(records.map((r) => [r.workDate, r]));

      const result = recapEmployee({ calendar, ...period, today, employment: row, records: records.map(toRecapRecord), leaves });
      const days: AttendanceDay[] = result.days.map((day) => {
        const record = recordByDate.get(day.date);
        return {
          ...day,
          record: record
            ? {
                checkInAt: record.checkInAt.toISOString(),
                checkOutAt: record.checkOutAt ? record.checkOutAt.toISOString() : null,
                lateMinutes: record.lateMinutes,
                // Kolom `time` dibaca "08:00:00" → "08:00"
                scheduledStart: record.scheduledStart ? record.scheduledStart.slice(0, 5) : null,
                scheduledEnd: record.scheduledEnd ? record.scheduledEnd.slice(0, 5) : null,
              }
            : null,
          corrected: correctedDates.has(day.date),
        };
      });
      return {
        employee: toEmployee(row),
        ...period,
        today,
        timeZone,
        summary: result.summary,
        days,
        canCorrect: viewer.manage && row.id !== viewer.ownEmployeeId,
      };
    });
  }

  // Rekap per karyawan untuk modul lain (skor KPI feature 21) di dalam transaksi ber-tenant pemanggil — cakupan penglihat dicek pemanggil
  async recapEmployees(
    tx: Transaction,
    rows: readonly (RecapEmployment & { id: string })[],
    period: Period,
    today: string,
    calendar: WorkCalendar,
  ): Promise<Map<string, RecapResult>> {
    const ids = rows.map((row) => row.id);
    const records = await this.selectRecords(tx, ids, period);
    const leaves = await this.selectLeaves(tx, ids, period);
    return new Map(
      rows.map((row) => [
        row.id,
        recapEmployee({
          calendar,
          ...period,
          today,
          employment: row,
          records: records.filter((r) => r.employeeId === row.id).map(toRecapRecord),
          leaves: leaves.filter((l) => l.employeeId === row.id),
        }),
      ]),
    );
  }

  // ——— helper ———

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
        employeeId: attendanceRecords.employeeId,
        workDate: attendanceRecords.workDate,
        checkInAt: attendanceRecords.checkInAt,
        checkOutAt: attendanceRecords.checkOutAt,
        lateMinutes: attendanceRecords.lateMinutes,
        scheduledStart: attendanceRecords.scheduledStart,
        scheduledEnd: attendanceRecords.scheduledEnd,
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

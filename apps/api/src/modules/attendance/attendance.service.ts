import { attendanceRecords, employees, provinces, regencies, tenants } from "@exapay/db";
import {
  type AttendanceAccess,
  type AttendanceHistory,
  type AttendanceLocation,
  type AttendanceRecord,
  DEFAULT_TENANT_TIME_ZONE,
  type GeofenceResult,
  type GeofenceStatus,
} from "@exapay/shared";
import { ConflictException, ForbiddenException, Inject, Injectable } from "@nestjs/common";
import { and, asc, between, eq, isNull } from "drizzle-orm";

import { type AuthUser, tenantContextOf } from "../../common/auth/auth-user.js";
import { DRIZZLE } from "../../database/database.module.js";
import { isUniqueViolation } from "../../database/errors.js";
import { type Database, type Transaction, withTenant } from "../../database/tenant-transaction.js";
import { lateMinutes, localClock, monthRange } from "./attendance-clock.js";
import { evaluateGeofence } from "./geofence.js";
import { type WorkDayInfo, WorkCalendarService } from "./work-calendar.service.js";
import { WorkLocationsService } from "./work-locations.service.js";

export type AttendanceTodayResult = {
  access: AttendanceAccess;
  serverTime: string;
  timeZone: string;
  date: string;
  day: WorkDayInfo;
  locationCheck: boolean;
  record: AttendanceRecord | null;
};

export type OwnEmployee = { id: string; joinDate: string; endDate: string | null };

// Riwayat tanpa jumlah alpa — alpa butuh kalender kerja + izin disetujui, dilengkapi AttendanceRecapService.myHistory
export type OwnAttendanceHistory = Omit<AttendanceHistory, "summary"> & { summary: Omit<AttendanceHistory["summary"], "absent"> };

const recordColumns = {
  id: attendanceRecords.id,
  workDate: attendanceRecords.workDate,
  checkInAt: attendanceRecords.checkInAt,
  checkOutAt: attendanceRecords.checkOutAt,
  scheduledStart: attendanceRecords.scheduledStart,
  scheduledEnd: attendanceRecords.scheduledEnd,
  lateMinutes: attendanceRecords.lateMinutes,
  checkInLatitude: attendanceRecords.checkInLatitude,
  checkInAccuracy: attendanceRecords.checkInAccuracy,
  checkInGeofence: attendanceRecords.checkInGeofence,
  checkInDistanceM: attendanceRecords.checkInDistanceM,
  checkInLocationName: attendanceRecords.checkInLocationName,
  checkOutLatitude: attendanceRecords.checkOutLatitude,
  checkOutAccuracy: attendanceRecords.checkOutAccuracy,
  checkOutGeofence: attendanceRecords.checkOutGeofence,
  checkOutDistanceM: attendanceRecords.checkOutDistanceM,
  checkOutLocationName: attendanceRecords.checkOutLocationName,
};

type RecordRow = {
  id: string;
  workDate: string;
  checkInAt: Date;
  checkOutAt: Date | null;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  lateMinutes: number;
  checkInLatitude: number | null;
  checkInAccuracy: number | null;
  checkInGeofence: GeofenceStatus | null;
  checkInDistanceM: number | null;
  checkInLocationName: string | null;
  checkOutLatitude: number | null;
  checkOutAccuracy: number | null;
  checkOutGeofence: GeofenceStatus | null;
  checkOutDistanceM: number | null;
  checkOutLocationName: string | null;
};

function geofenceOf(status: GeofenceStatus | null, distanceM: number | null, locationName: string | null, accuracyM: number | null): GeofenceResult | null {
  return status === null ? null : { status, distanceM, locationName, accuracyM };
}

function toRecord(row: RecordRow): AttendanceRecord {
  return {
    id: row.id,
    workDate: row.workDate,
    checkInAt: row.checkInAt.toISOString(),
    checkOutAt: row.checkOutAt ? row.checkOutAt.toISOString() : null,
    // Kolom `time` dibaca "08:00:00" → "08:00"
    scheduledStart: row.scheduledStart ? row.scheduledStart.slice(0, 5) : null,
    scheduledEnd: row.scheduledEnd ? row.scheduledEnd.slice(0, 5) : null,
    lateMinutes: row.lateMinutes,
    status: row.scheduledStart === null ? "off_day" : row.lateMinutes > 0 ? "late" : "on_time",
    checkInLocated: row.checkInLatitude !== null,
    checkOutLocated: row.checkOutLatitude !== null,
    checkInGeofence: geofenceOf(row.checkInGeofence, row.checkInDistanceM, row.checkInLocationName, row.checkInAccuracy),
    checkOutGeofence: geofenceOf(row.checkOutGeofence, row.checkOutDistanceM, row.checkOutLocationName, row.checkOutAccuracy),
  };
}

// Absen masuk/pulang milik sendiri (feature 14). Semua peran yang akunnya tertaut ke data karyawan aktif boleh absen.
// Jam selalu `new Date()` server; tanggal kerja & telat dihitung di zona waktu provinsi usaha.
@Injectable()
export class AttendanceService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly workCalendar: WorkCalendarService,
    private readonly workLocations: WorkLocationsService,
  ) {}

  async today(user: AuthUser): Promise<AttendanceTodayResult> {
    const now = new Date();
    const ctx = tenantContextOf(user);
    return withTenant(this.db, ctx, async (tx) => {
      const timeZone = await this.tenantTimeZone(tx, ctx.tenantId);
      const clock = localClock(now, timeZone);
      const employee = await this.ownEmployee(tx, user.userId);
      const day = await this.workCalendar.dayInfo(tx, clock.date);
      const record = employee ? await this.findRecord(tx, employee.id, clock.date) : null;
      const sites = employee ? await this.workLocations.sitesFor(tx, employee.id) : [];
      return {
        access: this.accessOf(employee, clock.date),
        serverTime: now.toISOString(),
        timeZone,
        date: clock.date,
        day,
        locationCheck: sites.length > 0,
        record: record ? toRecord(record) : null,
      };
    });
  }

  async checkIn(user: AuthUser, location: AttendanceLocation | null): Promise<AttendanceRecord> {
    const now = new Date();
    const ctx = tenantContextOf(user);
    try {
      return await withTenant(this.db, ctx, async (tx) => {
        const timeZone = await this.tenantTimeZone(tx, ctx.tenantId);
        const clock = localClock(now, timeZone);
        const employee = await this.requireEmployee(tx, user.userId, clock.date);
        const day = await this.workCalendar.dayInfo(tx, clock.date);
        // Absen selalu diterima; status lokasi hanya tanda untuk ditinjau (snapshot saat ini)
        const geofence = evaluateGeofence(location, await this.workLocations.sitesFor(tx, employee.id));

        const [row] = await tx
          .insert(attendanceRecords)
          .values({
            tenantId: ctx.tenantId,
            employeeId: employee.id,
            workDate: clock.date,
            timeZone,
            scheduledStart: day.startTime,
            scheduledEnd: day.endTime,
            lateMinutes: lateMinutes(clock.minutes, day.startTime),
            checkInAt: now,
            checkInLatitude: location?.latitude ?? null,
            checkInLongitude: location?.longitude ?? null,
            checkInAccuracy: location?.accuracy ?? null,
            checkInGeofence: geofence?.status ?? null,
            checkInDistanceM: geofence?.distanceM ?? null,
            checkInLocationName: geofence?.locationName ?? null,
          })
          .returning(recordColumns);
        if (!row) throw new Error("[attendance/checkIn] insert tidak mengembalikan baris");
        return toRecord(row);
      });
    } catch (error: unknown) {
      // Satu absen masuk per hari — termasuk dua ketukan bersamaan
      if (isUniqueViolation(error)) throw new ConflictException("Anda sudah absen masuk hari ini");
      throw error;
    }
  }

  async checkOut(user: AuthUser, location: AttendanceLocation | null): Promise<AttendanceRecord> {
    const now = new Date();
    const ctx = tenantContextOf(user);
    return withTenant(this.db, ctx, async (tx) => {
      const timeZone = await this.tenantTimeZone(tx, ctx.tenantId);
      const clock = localClock(now, timeZone);
      const employee = await this.requireEmployee(tx, user.userId, clock.date);
      const geofence = evaluateGeofence(location, await this.workLocations.sitesFor(tx, employee.id));

      const [row] = await tx
        .update(attendanceRecords)
        .set({
          checkOutAt: now,
          checkOutLatitude: location?.latitude ?? null,
          checkOutLongitude: location?.longitude ?? null,
          checkOutAccuracy: location?.accuracy ?? null,
          checkOutGeofence: geofence?.status ?? null,
          checkOutDistanceM: geofence?.distanceM ?? null,
          checkOutLocationName: geofence?.locationName ?? null,
        })
        .where(
          and(eq(attendanceRecords.employeeId, employee.id), eq(attendanceRecords.workDate, clock.date), isNull(attendanceRecords.checkOutAt)),
        )
        .returning(recordColumns);
      if (row) return toRecord(row);

      const existing = await this.findRecord(tx, employee.id, clock.date);
      if (existing) throw new ConflictException("Anda sudah absen pulang hari ini");
      throw new ConflictException("Anda belum absen masuk hari ini");
    });
  }

  async history(user: AuthUser, month: string | undefined): Promise<OwnAttendanceHistory> {
    const now = new Date();
    const ctx = tenantContextOf(user);
    return withTenant(this.db, ctx, async (tx) => {
      const timeZone = await this.tenantTimeZone(tx, ctx.tenantId);
      const clock = localClock(now, timeZone);
      const currentMonth = clock.date.slice(0, 7);
      const selected = month ?? currentMonth;
      const employee = await this.ownEmployee(tx, user.userId);

      const { from, to } = monthRange(selected);
      const rows = employee
        ? await tx
            .select(recordColumns)
            .from(attendanceRecords)
            .where(and(eq(attendanceRecords.employeeId, employee.id), between(attendanceRecords.workDate, from, to)))
            .orderBy(asc(attendanceRecords.workDate))
        : [];
      const records = rows.map(toRecord);
      const late = records.filter((r) => r.status === "late");
      return {
        access: this.accessOf(employee, clock.date),
        month: selected,
        currentMonth,
        timeZone,
        // Terbaru di atas
        records: records.reverse(),
        summary: {
          present: records.length,
          late: late.length,
          lateMinutes: late.reduce((total, r) => total + r.lateMinutes, 0),
        },
      };
    });
  }

  // ——— dipakai juga LeaveRequestsService (feature 15) ———

  // Zona waktu provinsi dari kota di profil usaha (feature 09); belum diisi → WIB
  async tenantTimeZone(tx: Transaction, tenantId: string): Promise<string> {
    const [row] = await tx
      .select({ timeZone: provinces.timeZone })
      .from(tenants)
      .innerJoin(regencies, eq(regencies.code, tenants.regencyCode))
      .innerJoin(provinces, eq(provinces.code, regencies.provinceCode))
      // RLS juga memperlihatkan usaha lain milik user — filter eksplisit ke usaha aktif
      .where(eq(tenants.id, tenantId));
    return row?.timeZone ?? DEFAULT_TENANT_TIME_ZONE;
  }

  // Data karyawan yang tertaut ke akun ini di usaha aktif (unik per tenant)
  async ownEmployee(tx: Transaction, userId: string): Promise<OwnEmployee | null> {
    const [row] = await tx
      .select({ id: employees.id, joinDate: employees.joinDate, endDate: employees.endDate })
      .from(employees)
      .where(eq(employees.userId, userId));
    return row ?? null;
  }

  accessOf(employee: OwnEmployee | null, date: string): AttendanceAccess {
    if (!employee) return "not_linked";
    if (employee.endDate !== null) return "inactive";
    return date < employee.joinDate ? "inactive" : "ok";
  }

  async requireEmployee(tx: Transaction, userId: string, date: string): Promise<OwnEmployee> {
    const employee = await this.ownEmployee(tx, userId);
    const access = this.accessOf(employee, date);
    if (!employee || access === "not_linked") throw new ForbiddenException("Akun Anda belum tertaut ke data karyawan. Hubungi admin usaha.");
    if (access === "inactive") throw new ForbiddenException("Data karyawan Anda tidak aktif hari ini. Hubungi admin usaha.");
    return employee;
  }

  private async findRecord(tx: Transaction, employeeId: string, date: string): Promise<RecordRow | null> {
    const [row] = await tx
      .select(recordColumns)
      .from(attendanceRecords)
      .where(and(eq(attendanceRecords.employeeId, employeeId), eq(attendanceRecords.workDate, date)));
    return row ?? null;
  }
}

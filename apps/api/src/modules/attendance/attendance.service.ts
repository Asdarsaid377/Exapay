import { randomUUID } from "node:crypto";

import { attendanceRecords, employees, provinces, regencies, tenants } from "@exapay/db";
import {
  type AttendanceAccess,
  type AttendanceEvent,
  type AttendanceHistory,
  type AttendanceLocation,
  type AttendanceRecord,
  type AttendanceToday,
  DEFAULT_TENANT_TIME_ZONE,
  type EmployeeScheduleMode,
  type GeofenceResult,
  type GeofenceStatus,
  type SelfieState,
  type TaskPhotoType,
} from "@exapay/shared";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { and, asc, between, eq, isNull } from "drizzle-orm";

import { type AuthUser, tenantContextOf } from "../../common/auth/auth-user.js";
import { DRIZZLE } from "../../database/database.module.js";
import { isUniqueViolation } from "../../database/errors.js";
import { type Database, type Transaction, withTenant } from "../../database/tenant-transaction.js";
import { FileStorage, tenantFileKey } from "../storage/file-storage.js";
import { detectTaskPhotoType, TASK_PHOTO_EXTENSIONS } from "../tasks/task-log-rules.js";
import { lateMinutes, localClock, monthRange } from "./attendance-clock.js";
import { loadAttendanceViewer, viewerCanSee } from "./attendance-viewer.js";
import { evaluateGeofence } from "./geofence.js";
import { matchCheckIn, openOvernightDate, type ShiftDayFacts, type ShiftTimes } from "./shift-attendance.js";
import { addDays, rosterEntryOf } from "./shift-roster.js";
import { type RosterDayRow, type WorkDayInfo, WorkCalendarService } from "./work-calendar.service.js";
import { WorkLocationsService } from "./work-locations.service.js";

export type AttendanceTodayResult = {
  access: AttendanceAccess;
  serverTime: string;
  timeZone: string;
  date: string;
  day: WorkDayInfo;
  locationCheck: boolean;
  selfieRequired: boolean;
  shift: AttendanceToday["shift"];
  record: AttendanceRecord | null;
};

export type OwnEmployee = { id: string; joinDate: string; endDate: string | null; selfieRequired: boolean; scheduleMode: EmployeeScheduleMode };

// Jadwal absen masuk: jam jadwal snapshot + nama shift (mode shift) + tanda tanpa jadwal
type CheckInSchedule = {
  workDate: string;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  lateMinutes: number;
  shiftName: string | null;
  unscheduled: boolean;
};

// Bagian file multipart `selfie` (multer memory storage)
export type UploadedSelfie = { buffer: Buffer; size: number };
export type SelfieFile = { buffer: Buffer; contentType: TaskPhotoType };

const SELFIE_REQUIRED = "Selfie wajib diambil saat absen. Izinkan kamera lalu coba lagi.";
const SELFIE_NOT_FOUND = "Foto selfie tidak ditemukan";

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
  checkInSelfieKey: attendanceRecords.checkInSelfieKey,
  checkInSelfieType: attendanceRecords.checkInSelfieType,
  checkOutSelfieKey: attendanceRecords.checkOutSelfieKey,
  checkOutSelfieType: attendanceRecords.checkOutSelfieType,
  shiftName: attendanceRecords.shiftName,
  unscheduled: attendanceRecords.unscheduled,
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
  checkInSelfieKey: string | null;
  checkInSelfieType: TaskPhotoType | null;
  checkOutSelfieKey: string | null;
  checkOutSelfieType: TaskPhotoType | null;
  shiftName: string | null;
  unscheduled: boolean;
};

// Key terisi = foto ada; key dihapus worker (> 90 hari) tetapi jenis tersimpan = foto sudah dihapus
export function selfieStateOf(key: string | null, type: string | null): SelfieState | null {
  if (key !== null) return "available";
  return type !== null ? "expired" : null;
}

export function geofenceOf(status: GeofenceStatus | null, distanceM: number | null, locationName: string | null, accuracyM: number | null): GeofenceResult | null {
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
    shiftName: row.shiftName,
    unscheduled: row.unscheduled,
    checkInLocated: row.checkInLatitude !== null,
    checkOutLocated: row.checkOutLatitude !== null,
    checkInGeofence: geofenceOf(row.checkInGeofence, row.checkInDistanceM, row.checkInLocationName, row.checkInAccuracy),
    checkOutGeofence: geofenceOf(row.checkOutGeofence, row.checkOutDistanceM, row.checkOutLocationName, row.checkOutAccuracy),
    checkInSelfie: selfieStateOf(row.checkInSelfieKey, row.checkInSelfieType),
    checkOutSelfie: selfieStateOf(row.checkOutSelfieKey, row.checkOutSelfieType),
  };
}

// Absen masuk/pulang milik sendiri (feature 14). Semua peran yang akunnya tertaut ke data karyawan aktif boleh absen.
// Jam selalu `new Date()` server; tanggal kerja & telat dihitung di zona waktu provinsi usaha.
// Selfie (feature 45): karyawan wajib selfie → absen tanpa foto ditolak; foto hanya bukti (tanpa pengenalan wajah).
// Mode shift (feature 47): absen dicocokkan ke roster (shift-attendance.ts) — jadwal usaha tidak dipakai.
@Injectable()
export class AttendanceService {
  private readonly logger = new Logger(AttendanceService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly workCalendar: WorkCalendarService,
    private readonly workLocations: WorkLocationsService,
    private readonly storage: FileStorage,
  ) {}

  async today(user: AuthUser): Promise<AttendanceTodayResult> {
    const now = new Date();
    const ctx = tenantContextOf(user);
    return withTenant(this.db, ctx, async (tx) => {
      const timeZone = await this.tenantTimeZone(tx, ctx.tenantId);
      const clock = localClock(now, timeZone);
      const employee = await this.ownEmployee(tx, user.userId);
      const day = await this.workCalendar.dayInfo(tx, clock.date);
      const sites = employee ? await this.workLocations.sitesFor(tx, employee.id) : [];
      let record = employee ? await this.findRecord(tx, employee.id, clock.date) : null;
      let shift: AttendanceToday["shift"] = null;

      if (employee?.scheduleMode === "shift") {
        const facts = await this.shiftFacts(tx, employee.id, clock.date);
        // Kartu aktif: shift malam kemarin yang belum pulang → absen hari ini → shift yang bisa diabsen sekarang
        const overnight = openOvernightDate(now, clock.date, timeZone, facts.days);
        let workDate = overnight ?? clock.date;
        let checkInOpensAt: string | null = null;
        if (overnight) record = await this.findRecord(tx, employee.id, overnight);
        else if (!record) {
          const match = matchCheckIn(now, clock.date, timeZone, facts.days);
          if (match.kind === "shift") workDate = match.shift.workDate;
          if (match.kind === "too_early") checkInOpensAt = match.opensAt.toISOString();
        }
        const row = facts.rows.find((r) => r.workDate === workDate);
        shift = { workDate, entry: row ? rosterEntryOf(row) : null, checkInOpensAt };
      }

      return {
        access: this.accessOf(employee, clock.date),
        serverTime: now.toISOString(),
        timeZone,
        date: clock.date,
        day,
        locationCheck: sites.length > 0,
        selfieRequired: employee?.selfieRequired ?? false,
        shift,
        record: record ? toRecord(record) : null,
      };
    });
  }

  async checkIn(user: AuthUser, location: AttendanceLocation | null, file: UploadedSelfie | null): Promise<AttendanceRecord> {
    const selfie = file ? this.inspectSelfie(file) : null;
    const now = new Date();
    const ctx = tenantContextOf(user);
    const id = randomUUID();
    const key = selfie ? this.selfieKey(ctx.tenantId, id, "check_in", selfie.contentType) : null;
    let uploaded = false;
    try {
      return await withTenant(this.db, ctx, async (tx) => {
        const timeZone = await this.tenantTimeZone(tx, ctx.tenantId);
        const clock = localClock(now, timeZone);
        const employee = await this.requireEmployee(tx, user.userId, clock.date);
        if (employee.selfieRequired && !selfie) throw new BadRequestException(SELFIE_REQUIRED);
        const schedule = await this.checkInSchedule(tx, employee, now, clock, timeZone);
        // Absen selalu diterima; status lokasi hanya tanda untuk ditinjau (snapshot saat ini)
        const geofence = evaluateGeofence(location, await this.workLocations.sitesFor(tx, employee.id));

        const [row] = await tx
          .insert(attendanceRecords)
          .values({
            id,
            tenantId: ctx.tenantId,
            employeeId: employee.id,
            workDate: schedule.workDate,
            timeZone,
            scheduledStart: schedule.scheduledStart,
            scheduledEnd: schedule.scheduledEnd,
            lateMinutes: schedule.lateMinutes,
            shiftName: schedule.shiftName,
            unscheduled: schedule.unscheduled,
            checkInAt: now,
            checkInLatitude: location?.latitude ?? null,
            checkInLongitude: location?.longitude ?? null,
            checkInAccuracy: location?.accuracy ?? null,
            checkInGeofence: geofence?.status ?? null,
            checkInDistanceM: geofence?.distanceM ?? null,
            checkInLocationName: geofence?.locationName ?? null,
            checkInSelfieKey: key,
            checkInSelfieType: selfie?.contentType ?? null,
          })
          .returning(recordColumns);
        if (!row) throw new Error("[attendance/checkIn] insert tidak mengembalikan baris");
        // Upload terakhir di transaksi: gagal → absen ikut batal (jam = jam server saat absen diterima)
        if (selfie && key) {
          await this.putSelfie(key, selfie);
          uploaded = true;
        }
        return toRecord(row);
      });
    } catch (error: unknown) {
      // Commit gagal setelah upload → file yatim dihapus (best effort)
      if (uploaded && key) await this.removeQuietly(key);
      // Satu absen masuk per hari — termasuk dua ketukan bersamaan
      if (isUniqueViolation(error)) throw new ConflictException("Anda sudah absen masuk hari ini");
      throw error;
    }
  }

  async checkOut(user: AuthUser, location: AttendanceLocation | null, file: UploadedSelfie | null): Promise<AttendanceRecord> {
    const selfie = file ? this.inspectSelfie(file) : null;
    const now = new Date();
    const ctx = tenantContextOf(user);
    let key: string | null = null;
    let uploaded = false;
    try {
      return await withTenant(this.db, ctx, async (tx) => {
        const timeZone = await this.tenantTimeZone(tx, ctx.tenantId);
        const clock = localClock(now, timeZone);
        const employee = await this.requireEmployee(tx, user.userId, clock.date);
        if (employee.selfieRequired && !selfie) throw new BadRequestException(SELFIE_REQUIRED);
        const existing = await this.checkOutRecord(tx, employee, now, clock.date, timeZone);
        if (!existing) throw new ConflictException("Anda belum absen masuk hari ini");
        key = selfie ? this.selfieKey(ctx.tenantId, existing.id, "check_out", selfie.contentType) : null;
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
            checkOutSelfieKey: key,
            checkOutSelfieType: selfie?.contentType ?? null,
          })
          .where(and(eq(attendanceRecords.id, existing.id), isNull(attendanceRecords.checkOutAt)))
          .returning(recordColumns);
        // Sudah pulang — termasuk dua ketukan bersamaan (UPDATE kedua menunggu kunci baris lalu tidak cocok lagi)
        if (!row) throw new ConflictException("Anda sudah absen pulang hari ini");
        if (selfie && key) {
          await this.putSelfie(key, selfie);
          uploaded = true;
        }
        return toRecord(row);
      });
    } catch (error: unknown) {
      if (uploaded && key) await this.removeQuietly(key);
      throw error;
    }
  }

  // Selfie absen masuk/pulang: pemilik absen, atasan langsungnya, owner/admin (di luar cakupan → 404)
  async selfie(user: AuthUser, recordId: string, event: AttendanceEvent): Promise<SelfieFile> {
    const ctx = tenantContextOf(user);
    const found = await withTenant(this.db, ctx, async (tx) => {
      const [row] = await tx
        .select({
          checkInKey: attendanceRecords.checkInSelfieKey,
          checkInType: attendanceRecords.checkInSelfieType,
          checkOutKey: attendanceRecords.checkOutSelfieKey,
          checkOutType: attendanceRecords.checkOutSelfieType,
          employeeUserId: employees.userId,
          supervisorId: employees.supervisorId,
        })
        .from(attendanceRecords)
        .innerJoin(employees, eq(employees.id, attendanceRecords.employeeId))
        .where(eq(attendanceRecords.id, recordId));
      if (!row) throw new NotFoundException(SELFIE_NOT_FOUND);
      if (row.employeeUserId !== user.userId) {
        const viewer = await loadAttendanceViewer(tx, ctx);
        if (!viewer || !viewerCanSee(viewer, row.supervisorId)) throw new NotFoundException(SELFIE_NOT_FOUND);
      }
      const [key, contentType] = event === "check_in" ? [row.checkInKey, row.checkInType] : [row.checkOutKey, row.checkOutType];
      if (!key && contentType) throw new NotFoundException("Foto selfie sudah dihapus otomatis (disimpan 90 hari)");
      if (!key || !contentType) throw new NotFoundException(SELFIE_NOT_FOUND);
      return { key, contentType };
    });

    try {
      return { buffer: await this.storage.get(found.key), contentType: found.contentType };
    } catch (error: unknown) {
      this.logger.error(`[attendance/selfie] ${recordId}/${event}: ${error instanceof Error ? error.message : String(error)}`);
      throw new ServiceUnavailableException("Foto tidak dapat dibuka saat ini. Coba lagi nanti.");
    }
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
      .select({
        id: employees.id,
        joinDate: employees.joinDate,
        endDate: employees.endDate,
        selfieRequired: employees.selfieRequired,
        scheduleMode: employees.scheduleMode,
      })
      .from(employees)
      .where(eq(employees.userId, userId));
    return row ?? null;
  }

  accessOf(employee: Pick<OwnEmployee, "joinDate" | "endDate"> | null, date: string): AttendanceAccess {
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

  // Ikut jadwal usaha: jadwal hari ini (feature 14). Mode shift: shift roster yang dicocokkan; terlalu awal → ditolak.
  private async checkInSchedule(tx: Transaction, employee: OwnEmployee, now: Date, clock: { date: string; minutes: number }, timeZone: string): Promise<CheckInSchedule> {
    if (employee.scheduleMode !== "shift") {
      const day = await this.workCalendar.dayInfo(tx, clock.date);
      return {
        workDate: clock.date,
        scheduledStart: day.startTime,
        scheduledEnd: day.endTime,
        lateMinutes: lateMinutes(clock.minutes, day.startTime),
        shiftName: null,
        unscheduled: false,
      };
    }
    const facts = await this.shiftFacts(tx, employee.id, clock.date);
    const match = matchCheckIn(now, clock.date, timeZone, facts.days);
    if (match.kind === "too_early") {
      const opens = localClock(match.opensAt, timeZone);
      const time = `${String(Math.floor(opens.minutes / 60)).padStart(2, "0")}:${String(opens.minutes % 60).padStart(2, "0")}`;
      throw new BadRequestException(`Absen masuk shift ${match.shift.name} baru dibuka pukul ${time}`);
    }
    if (match.kind === "unscheduled")
      return { workDate: match.workDate, scheduledStart: null, scheduledEnd: null, lateMinutes: 0, shiftName: null, unscheduled: true };
    return {
      workDate: match.shift.workDate,
      scheduledStart: match.shift.startTime,
      scheduledEnd: match.shift.endTime,
      lateMinutes: match.lateMinutes,
      shiftName: match.shift.name,
      unscheduled: false,
    };
  }

  // Absen hari ini; mode shift: bila belum ada, absen shift malam kemarin yang belum pulang
  private async checkOutRecord(tx: Transaction, employee: OwnEmployee, now: Date, today: string, timeZone: string): Promise<RecordRow | null> {
    const record = await this.findRecord(tx, employee.id, today);
    if (record || employee.scheduleMode !== "shift") return record;
    const facts = await this.shiftFacts(tx, employee.id, today);
    const overnight = openOvernightDate(now, today, timeZone, facts.days);
    return overnight ? this.findRecord(tx, employee.id, overnight) : null;
  }

  // Roster & absen kemarin–besok untuk pencocokan shift
  private async shiftFacts(tx: Transaction, employeeId: string, today: string): Promise<{ days: ShiftDayFacts; rows: RosterDayRow[] }> {
    const from = addDays(today, -1);
    const to = addDays(today, 1);
    const rows = await this.workCalendar.rosterRows(tx, [employeeId], from, to);
    const records = await tx
      .select({
        workDate: attendanceRecords.workDate,
        checkOutAt: attendanceRecords.checkOutAt,
        scheduledStart: attendanceRecords.scheduledStart,
        scheduledEnd: attendanceRecords.scheduledEnd,
      })
      .from(attendanceRecords)
      .where(and(eq(attendanceRecords.employeeId, employeeId), between(attendanceRecords.workDate, from, to)));
    const roster = new Map<string, ShiftTimes | "off">(
      rows.map((row) => [
        row.workDate,
        row.shiftName !== null && row.startTime !== null && row.endTime !== null
          ? { name: row.shiftName, startTime: row.startTime.slice(0, 5), endTime: row.endTime.slice(0, 5) }
          : "off",
      ]),
    );
    const recordMap = new Map(
      records.map((record) => [
        record.workDate,
        {
          checkedOut: record.checkOutAt !== null,
          scheduledStart: record.scheduledStart ? record.scheduledStart.slice(0, 5) : null,
          scheduledEnd: record.scheduledEnd ? record.scheduledEnd.slice(0, 5) : null,
        },
      ]),
    );
    return { days: { roster, records: recordMap }, rows };
  }

  private inspectSelfie(file: UploadedSelfie): SelfieFile {
    if (file.size === 0) throw new BadRequestException("File selfie kosong");
    const contentType = detectTaskPhotoType(file.buffer);
    if (!contentType) throw new BadRequestException("Selfie harus berupa foto JPG, PNG, atau WebP");
    return { buffer: file.buffer, contentType };
  }

  private selfieKey(tenantId: string, recordId: string, event: AttendanceEvent, contentType: TaskPhotoType): string {
    return tenantFileKey(tenantId, "attendance-selfies", recordId, `${event}-${randomUUID()}.${TASK_PHOTO_EXTENSIONS[contentType]}`);
  }

  private async putSelfie(key: string, selfie: SelfieFile): Promise<void> {
    try {
      await this.storage.put(key, selfie.buffer, selfie.contentType);
    } catch {
      // Detail sudah di-log FileStorage
      throw new ServiceUnavailableException("Selfie gagal dikirim. Coba lagi.");
    }
  }

  private async removeQuietly(key: string): Promise<void> {
    try {
      await this.storage.remove(key);
    } catch {
      this.logger.warn(`[attendance/selfie] file yatim tidak terhapus: ${key}`);
    }
  }

  private async findRecord(tx: Transaction, employeeId: string, date: string): Promise<RecordRow | null> {
    const [row] = await tx
      .select(recordColumns)
      .from(attendanceRecords)
      .where(and(eq(attendanceRecords.employeeId, employeeId), eq(attendanceRecords.workDate, date)));
    return row ?? null;
  }
}

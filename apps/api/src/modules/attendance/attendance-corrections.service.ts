import { attendanceCorrections, attendanceRecords, employees, users } from "@exapay/db";
import {
  ATTENDANCE_CORRECTIONS_PAGE_SIZE,
  type AttendanceCorrection,
  type AttendanceCorrectionInput,
  type AttendanceCorrectionList,
  type AttendanceCorrectionListQuery,
  type EmployeeScheduleMode,
} from "@exapay/shared";
import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, count, desc, eq } from "drizzle-orm";

import { type AuthUser, tenantContextOf } from "../../common/auth/auth-user.js";
import { DRIZZLE } from "../../database/database.module.js";
import { isUniqueViolation } from "../../database/errors.js";
import { type Database, type TenantContext, type Transaction, withTenant } from "../../database/tenant-transaction.js";
import { AuditService } from "../audit/audit.service.js";
import { lateMinutes, localClock, minutesOfDay, zonedInstant } from "./attendance-clock.js";
import { type AttendanceViewer, loadAttendanceViewer } from "./attendance-viewer.js";
import { AttendanceService } from "./attendance.service.js";
import { shiftLateMinutes } from "./shift-attendance.js";
import { addDays } from "./shift-roster.js";
import { WorkCalendarService } from "./work-calendar.service.js";

type Times = { checkInAt: Date | null; checkOutAt: Date | null; lateMinutes: number | null };

const iso = (value: Date | null): string | null => (value ? value.toISOString() : null);
const sameInstant = (a: Date | null, b: Date | null): boolean => (a === null ? b === null : b !== null && a.getTime() === b.getTime());

// Koreksi absensi oleh owner/admin (feature 16): mengisi/mengubah jam masuk & pulang satu karyawan pada satu tanggal,
// termasuk hari tanpa absen (baris absensi dibuat). Alasan wajib; sebelum/sesudah disimpan di attendance_corrections
// (append-only) + audit log. Izin/sakit/cuti tetap lewat pengajuan (feature 15), bukan koreksi.
@Injectable()
export class AttendanceCorrectionsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly attendance: AttendanceService,
    private readonly workCalendar: WorkCalendarService,
    private readonly audit: AuditService,
  ) {}

  async list(user: AuthUser, query: AttendanceCorrectionListQuery): Promise<AttendanceCorrectionList> {
    const ctx = tenantContextOf(user);
    return withTenant(this.db, ctx, async (tx) => {
      await this.requireManager(tx, ctx);
      const where = query.employeeId ? eq(attendanceCorrections.employeeId, query.employeeId) : undefined;
      const [totalRow] = await tx.select({ total: count() }).from(attendanceCorrections).where(where);
      const rows = await tx
        .select({
          id: attendanceCorrections.id,
          employeeId: attendanceCorrections.employeeId,
          employeeName: employees.fullName,
          workDate: attendanceCorrections.workDate,
          beforeCheckInAt: attendanceCorrections.beforeCheckInAt,
          beforeCheckOutAt: attendanceCorrections.beforeCheckOutAt,
          beforeLateMinutes: attendanceCorrections.beforeLateMinutes,
          afterCheckInAt: attendanceCorrections.afterCheckInAt,
          afterCheckOutAt: attendanceCorrections.afterCheckOutAt,
          afterLateMinutes: attendanceCorrections.afterLateMinutes,
          reason: attendanceCorrections.reason,
          correctedByName: attendanceCorrections.correctedByName,
          createdAt: attendanceCorrections.createdAt,
        })
        .from(attendanceCorrections)
        .innerJoin(employees, eq(employees.id, attendanceCorrections.employeeId))
        .where(where)
        .orderBy(desc(attendanceCorrections.createdAt))
        .limit(ATTENDANCE_CORRECTIONS_PAGE_SIZE)
        .offset((query.page - 1) * ATTENDANCE_CORRECTIONS_PAGE_SIZE);

      const items: AttendanceCorrection[] = rows.map((row) => ({
        id: row.id,
        employee: { id: row.employeeId, fullName: row.employeeName },
        workDate: row.workDate,
        before: { checkInAt: iso(row.beforeCheckInAt), checkOutAt: iso(row.beforeCheckOutAt), lateMinutes: row.beforeLateMinutes },
        after: { checkInAt: iso(row.afterCheckInAt), checkOutAt: iso(row.afterCheckOutAt), lateMinutes: row.afterLateMinutes },
        reason: row.reason,
        correctedByName: row.correctedByName,
        createdAt: row.createdAt.toISOString(),
      }));
      return {
        items,
        total: totalRow?.total ?? 0,
        page: query.page,
        pageSize: ATTENDANCE_CORRECTIONS_PAGE_SIZE,
        timeZone: await this.attendance.tenantTimeZone(tx, ctx.tenantId),
      };
    });
  }

  async create(user: AuthUser, input: AttendanceCorrectionInput): Promise<void> {
    const ctx = tenantContextOf(user);
    const now = new Date();
    try {
      await withTenant(this.db, ctx, async (tx) => {
        const manager = await this.requireManager(tx, ctx);
        const [employee] = await tx
          .select({ id: employees.id, joinDate: employees.joinDate, endDate: employees.endDate, scheduleMode: employees.scheduleMode })
          .from(employees)
          .where(eq(employees.id, input.employeeId));
        if (!employee) throw new NotFoundException("Karyawan tidak ditemukan");
        if (employee.id === manager.ownEmployeeId) throw new ForbiddenException("Anda tidak dapat mengoreksi absensi Anda sendiri");

        const tenantZone = await this.attendance.tenantTimeZone(tx, ctx.tenantId);
        const today = localClock(now, tenantZone).date;
        if (input.workDate > today) throw new BadRequestException("Tanggal koreksi belum terjadi");
        if (input.workDate < employee.joinDate || (employee.endDate !== null && input.workDate > employee.endDate))
          throw new BadRequestException("Tanggal di luar masa kerja karyawan");

        // Kunci baris: absen pulang karyawan / koreksi lain yang bersamaan menunggu transaksi ini
        const [existing] = await tx
          .select({
            id: attendanceRecords.id,
            timeZone: attendanceRecords.timeZone,
            scheduledStart: attendanceRecords.scheduledStart,
            scheduledEnd: attendanceRecords.scheduledEnd,
            shiftName: attendanceRecords.shiftName,
            checkInAt: attendanceRecords.checkInAt,
            checkOutAt: attendanceRecords.checkOutAt,
            lateMinutes: attendanceRecords.lateMinutes,
          })
          .from(attendanceRecords)
          .where(and(eq(attendanceRecords.employeeId, employee.id), eq(attendanceRecords.workDate, input.workDate)))
          .for("update");

        // Jam dibaca di zona waktu tanggal kerja itu (baris lama menyimpan zonanya sendiri)
        const timeZone = existing?.timeZone ?? tenantZone;
        // Jadwal: snapshot baris yang ada; hari tanpa absen → jadwal saat ini (roster untuk karyawan mode shift, feature 47)
        const schedule = existing
          ? {
              start: existing.scheduledStart?.slice(0, 5) ?? null,
              end: existing.scheduledEnd?.slice(0, 5) ?? null,
              shiftName: existing.shiftName,
            }
          : await this.scheduleOf(tx, employee.id, employee.scheduleMode, input.workDate);
        // Shift malam: jam pulang sebelum jam masuk dibaca keesokan hari
        const overnight = schedule.start !== null && schedule.end !== null && schedule.end <= schedule.start;
        if (input.checkOut !== null && input.checkOut < input.checkIn && !overnight)
          throw new BadRequestException("Jam pulang harus setelah jam masuk (jam pulang keesokan hari hanya untuk shift malam)");
        const checkInAt = zonedInstant(input.workDate, input.checkIn, timeZone);
        const checkOutAt = input.checkOut
          ? zonedInstant(input.checkOut < input.checkIn ? addDays(input.workDate, 1) : input.workDate, input.checkOut, timeZone)
          : null;
        if (checkInAt > now || (checkOutAt !== null && checkOutAt > now)) throw new BadRequestException("Jam koreksi belum terjadi");
        // Telat dari jam mulai jadwal; shift dihitung per instant (sama hasilnya untuk jadwal satu hari)
        const late =
          schedule.shiftName !== null && schedule.start !== null
            ? shiftLateMinutes(checkInAt, zonedInstant(input.workDate, schedule.start, timeZone))
            : lateMinutes(minutesOfDay(input.checkIn), schedule.start);

        let recordId: string;
        let before: Times;
        let after: Times;
        if (existing) {
          if (sameInstant(existing.checkInAt, checkInAt) && sameInstant(existing.checkOutAt, checkOutAt))
            throw new BadRequestException("Jam masuk dan pulang sama dengan data sekarang — tidak ada yang dikoreksi");
          // Jadwal tetap snapshot saat absen masuk; telat dihitung ulang dari jam masuk baru
          const checkInChanged = !sameInstant(existing.checkInAt, checkInAt);
          const checkOutChanged = !sameInstant(existing.checkOutAt, checkOutAt);
          await tx
            .update(attendanceRecords)
            .set({
              checkInAt,
              lateMinutes: late,
              checkOutAt,
              // Lokasi GPS & status geofence milik ketukan asli — tidak berlaku lagi untuk jam yang diubah (tanda hilang dari antrean tinjauan)
              ...(checkInChanged
                ? { checkInLatitude: null, checkInLongitude: null, checkInAccuracy: null, checkInGeofence: null, checkInDistanceM: null, checkInLocationName: null }
                : {}),
              ...(checkOutChanged
                ? { checkOutLatitude: null, checkOutLongitude: null, checkOutAccuracy: null, checkOutGeofence: null, checkOutDistanceM: null, checkOutLocationName: null }
                : {}),
            })
            .where(eq(attendanceRecords.id, existing.id));
          recordId = existing.id;
          before = { checkInAt: existing.checkInAt, checkOutAt: existing.checkOutAt, lateMinutes: existing.lateMinutes };
          after = { checkInAt, checkOutAt, lateMinutes: late };
        } else {
          // Hari tanpa absen: jadwal hari itu diambil dari jadwal saat ini (snapshot seperti absen biasa). Koreksi admin di hari
          // tanpa shift tidak diberi tanda "Tanpa jadwal" — sudah diputuskan pengoreksi.
          const [row] = await tx
            .insert(attendanceRecords)
            .values({
              tenantId: ctx.tenantId,
              employeeId: employee.id,
              workDate: input.workDate,
              timeZone,
              scheduledStart: schedule.start,
              scheduledEnd: schedule.end,
              shiftName: schedule.shiftName,
              lateMinutes: late,
              checkInAt,
              checkOutAt,
            })
            .returning({ id: attendanceRecords.id });
          if (!row) throw new Error("[attendance-corrections/create] insert tidak mengembalikan baris");
          recordId = row.id;
          before = { checkInAt: null, checkOutAt: null, lateMinutes: null };
          after = { checkInAt, checkOutAt, lateMinutes: late };
        }

        const [actor] = await tx.select({ fullName: users.fullName }).from(users).where(eq(users.id, user.userId));
        const [correction] = await tx
          .insert(attendanceCorrections)
          .values({
            tenantId: ctx.tenantId,
            attendanceRecordId: recordId,
            employeeId: employee.id,
            workDate: input.workDate,
            beforeCheckInAt: before.checkInAt,
            beforeCheckOutAt: before.checkOutAt,
            beforeLateMinutes: before.lateMinutes,
            afterCheckInAt: checkInAt,
            afterCheckOutAt: checkOutAt,
            afterLateMinutes: after.lateMinutes ?? 0,
            reason: input.reason,
            correctedByUserId: user.userId,
            correctedByName: actor?.fullName ?? null,
          })
          .returning({ id: attendanceCorrections.id });

        await this.audit.record(tx, ctx, {
          entity: "attendance_record",
          entityId: recordId,
          action: "correct",
          before: { workDate: input.workDate, checkInAt: iso(before.checkInAt), checkOutAt: iso(before.checkOutAt), lateMinutes: before.lateMinutes },
          after: {
            workDate: input.workDate,
            checkInAt: iso(after.checkInAt),
            checkOutAt: iso(after.checkOutAt),
            lateMinutes: after.lateMinutes,
            reason: input.reason,
            correctionId: correction?.id ?? null,
          },
        });
      });
    } catch (error: unknown) {
      // Karyawan absen masuk tepat saat koreksi membuat baris untuk tanggal yang sama
      if (isUniqueViolation(error)) throw new ConflictException("Karyawan baru saja absen pada tanggal ini. Muat ulang halaman lalu koreksi lagi.");
      throw error;
    }
  }

  private async scheduleOf(
    tx: Transaction,
    employeeId: string,
    mode: EmployeeScheduleMode,
    date: string,
  ): Promise<{ start: string | null; end: string | null; shiftName: string | null }> {
    if (mode === "shift") {
      const [row] = await this.workCalendar.rosterRows(tx, [employeeId], date, date);
      if (!row?.shiftName || !row.startTime || !row.endTime) return { start: null, end: null, shiftName: null };
      return { start: row.startTime.slice(0, 5), end: row.endTime.slice(0, 5), shiftName: row.shiftName };
    }
    const day = await this.workCalendar.dayInfo(tx, date);
    return { start: day.startTime, end: day.endTime, shiftName: null };
  }

  // Hanya owner/admin (dibaca ulang dari DB). Tidak ada yang mengoreksi absensinya sendiri.
  private async requireManager(tx: Transaction, ctx: TenantContext): Promise<AttendanceViewer> {
    const viewer = await loadAttendanceViewer(tx, ctx);
    if (!viewer?.manage) throw new ForbiddenException("Hanya pemilik atau admin yang dapat mengoreksi absensi");
    return viewer;
  }
}

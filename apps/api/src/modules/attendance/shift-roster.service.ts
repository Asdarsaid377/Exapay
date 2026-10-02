import { attendanceRecords, departments, employees, payrollRuns, positions, shiftRosterDays, workShifts } from "@exapay/db";
import {
  isOvernightShift,
  MY_SCHEDULE_DAYS,
  type MySchedule,
  ROSTER_NOTIFY_DELAY_MS,
  ROSTER_NOTIFY_JOB,
  type RosterCell,
  type RosterCellInput,
  type RosterCopyData,
  type RosterCopyResult,
  type RosterEntry,
  type RosterQuery,
  type RosterWeek,
} from "@exapay/shared";
import { ConflictException, ForbiddenException, Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { and, asc, between, eq, gte, inArray, isNull, lte, or } from "drizzle-orm";

import { type AuthUser, tenantContextOf } from "../../common/auth/auth-user.js";
import { DRIZZLE } from "../../database/database.module.js";
import { type Database, type TenantContext, type Transaction, withTenant } from "../../database/tenant-transaction.js";
import { ROSTER_QUEUE, type RosterQueue } from "../../redis/redis.module.js";
import { AuditService } from "../audit/audit.service.js";
import { localClock } from "./attendance-clock.js";
import { type AttendanceViewer, loadAttendanceViewer, viewerCanSee, viewerEmployeeScope } from "./attendance-viewer.js";
import { AttendanceService } from "./attendance.service.js";
import { addDays, type FinalRange, rosterEntryOf, rosterEntryText, rosterLockReason, weekDates, weekStartOf } from "./shift-roster.js";

type EmploymentRow = { id: string; joinDate: string; endDate: string | null };

const NOT_FOUND = "Karyawan tidak ditemukan";

// Roster shift (feature 46): karyawan mode "shift" dijadwalkan per tanggal (satu shift / libur per tanggal). Owner/admin semua
// karyawan, atasan bawahan langsung (peran & cakupan dibaca ulang dari DB). Sel terkunci (lewat / sudah absen / periode gaji
// final / di luar masa kerja) ditolak. Setiap perubahan diaudit (dari → ke); karyawan diberi tahu lewat email (worker, digabung).
@Injectable()
export class ShiftRosterService {
  private readonly logger = new Logger(ShiftRosterService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(ROSTER_QUEUE) private readonly queue: RosterQueue,
    private readonly audit: AuditService,
    private readonly attendance: AttendanceService,
  ) {}

  async week(user: AuthUser, query: RosterQuery): Promise<RosterWeek> {
    const ctx = tenantContextOf(user);
    return withTenant(this.db, ctx, async (tx) => {
      const viewer = await this.requireViewer(tx, ctx);
      const { today, timeZone } = await this.todayOf(tx, ctx);
      const weekStart = weekStartOf(query.week ?? today);
      const dates = weekDates(weekStart);
      const from = dates[0] ?? weekStart;
      const to = dates[dates.length - 1] ?? weekStart;

      const shifts = await tx
        .select({ id: workShifts.id, name: workShifts.name, startTime: workShifts.startTime, endTime: workShifts.endTime })
        .from(workShifts)
        .orderBy(asc(workShifts.startTime), asc(workShifts.name));

      // Karyawan dalam cakupan yang masih bekerja di minggu ini
      const inWeek = and(lte(employees.joinDate, to), or(isNull(employees.endDate), gte(employees.endDate, from)));
      const scope = and(inWeek, viewerEmployeeScope(viewer), query.departmentId ? eq(employees.departmentId, query.departmentId) : undefined);
      const rows = await tx
        .select({
          id: employees.id,
          fullName: employees.fullName,
          positionName: positions.name,
          departmentName: departments.name,
          joinDate: employees.joinDate,
          endDate: employees.endDate,
          scheduleMode: employees.scheduleMode,
        })
        .from(employees)
        .innerJoin(positions, eq(positions.id, employees.positionId))
        .innerJoin(departments, eq(departments.id, employees.departmentId))
        .where(scope)
        .orderBy(asc(employees.fullName));
      const shiftEmployees = rows.filter((row) => row.scheduleMode === "shift");
      const cellsOf = await this.cellsFor(tx, shiftEmployees, from, to, today);

      return {
        weekStart,
        dates,
        today,
        timeZone,
        shifts: shifts.map((shift) => {
          const startTime = shift.startTime.slice(0, 5);
          const endTime = shift.endTime.slice(0, 5);
          return { id: shift.id, name: shift.name, startTime, endTime, overnight: isOvernightShift(startTime, endTime) };
        }),
        employees: shiftEmployees.map((employee) => {
          const cells = dates.map((date) => cellsOf(employee.id, date));
          return {
            id: employee.id,
            fullName: employee.fullName,
            positionName: employee.positionName,
            departmentName: employee.departmentName,
            cells,
            shiftCount: cells.filter((cell) => cell.entry?.kind === "shift").length,
          };
        }),
        businessModeCount: rows.length - shiftEmployees.length,
        hasShifts: shifts.length > 0,
        canManageShifts: viewer.manage,
      };
    });
  }

  async setCell(user: AuthUser, employeeId: string, date: string, input: RosterCellInput): Promise<RosterCell> {
    const ctx = tenantContextOf(user);
    const cell = await withTenant(this.db, ctx, async (tx) => {
      const viewer = await this.requireViewer(tx, ctx);
      const [employee] = await tx
        .select({ id: employees.id, supervisorId: employees.supervisorId, joinDate: employees.joinDate, endDate: employees.endDate, scheduleMode: employees.scheduleMode })
        .from(employees)
        .where(eq(employees.id, employeeId))
        // Kunci karyawan: perubahan bersamaan pada sel yang sama tidak saling menimpa diam-diam
        .for("update");
      if (!employee || !viewerCanSee(viewer, employee.supervisorId)) throw new NotFoundException(NOT_FOUND);
      if (employee.scheduleMode !== "shift") throw new ConflictException("Karyawan ini ikut jadwal usaha — ubah mode jadwal ke Shift (roster) dulu");

      const { today } = await this.todayOf(tx, ctx);
      const lock = (await this.cellsFor(tx, [employee], date, date, today))(employee.id, date).lock;
      if (lock) throw new ConflictException(lockMessage(lock));

      const before = await this.entryAt(tx, employee.id, date);
      let after: RosterEntry | null;
      if (input.kind === "clear") {
        await tx.delete(shiftRosterDays).where(and(eq(shiftRosterDays.employeeId, employee.id), eq(shiftRosterDays.workDate, date)));
        after = null;
      } else {
        const values =
          input.kind === "off"
            ? { workShiftId: null, shiftName: null, startTime: null, endTime: null }
            : await this.shiftValues(tx, input.shiftId);
        await tx
          .insert(shiftRosterDays)
          .values({ tenantId: ctx.tenantId, employeeId: employee.id, workDate: date, ...values, updatedByUserId: user.userId })
          .onConflictDoUpdate({
            target: [shiftRosterDays.tenantId, shiftRosterDays.employeeId, shiftRosterDays.workDate],
            set: { ...values, updatedByUserId: user.userId },
          });
        after = rosterEntryOf({ ...values });
      }
      if (rosterEntryText(before) !== rosterEntryText(after)) {
        await this.audit.record(tx, ctx, {
          entity: "employee",
          entityId: employee.id,
          action: "update_roster",
          before: { date, entry: rosterEntryText(before) },
          after: { date, entry: rosterEntryText(after) },
        });
      }
      return { cell: { date, entry: after, lock: null }, changed: rosterEntryText(before) !== rosterEntryText(after) };
    });
    if (cell.changed) await this.notify(ctx.tenantId, [employeeId]);
    return cell.cell;
  }

  // Salin minggu lalu ke minggu `week` untuk karyawan shift dalam cakupan (filter departemen sama dengan tampilan).
  // Sumber kosong → sel tujuan dibiarkan; sel tujuan terkunci dilewati; isi lama ditimpa. Shift sumber dipakai dengan jam saat ini.
  async copyPreviousWeek(user: AuthUser, input: RosterCopyData): Promise<RosterCopyResult> {
    const ctx = tenantContextOf(user);
    const result = await withTenant(this.db, ctx, async (tx) => {
      const viewer = await this.requireViewer(tx, ctx);
      const { today } = await this.todayOf(tx, ctx);
      const targetDates = weekDates(weekStartOf(input.week));
      const from = targetDates[0] ?? input.week;
      const to = targetDates[targetDates.length - 1] ?? input.week;
      const sourceFrom = addDays(from, -7);

      const targets = await tx
        .select({ id: employees.id, joinDate: employees.joinDate, endDate: employees.endDate })
        .from(employees)
        .where(
          and(
            eq(employees.scheduleMode, "shift"),
            lte(employees.joinDate, to),
            or(isNull(employees.endDate), gte(employees.endDate, from)),
            viewerEmployeeScope(viewer),
            input.departmentId ? eq(employees.departmentId, input.departmentId) : undefined,
          ),
        )
        .for("update");
      const ids = targets.map((employee) => employee.id);
      const counts: RosterCopyResult = { filled: 0, overwritten: 0, skippedLocked: 0, skippedDeletedShift: 0, dryRun: input.dryRun };
      if (ids.length === 0) return { counts, changedEmployees: [] };

      const rowColumns = {
        employeeId: shiftRosterDays.employeeId,
        workDate: shiftRosterDays.workDate,
        workShiftId: shiftRosterDays.workShiftId,
        shiftName: shiftRosterDays.shiftName,
        startTime: shiftRosterDays.startTime,
        endTime: shiftRosterDays.endTime,
      };
      const rows = await tx
        .select(rowColumns)
        .from(shiftRosterDays)
        .where(and(inArray(shiftRosterDays.employeeId, ids), between(shiftRosterDays.workDate, sourceFrom, to)));
      const rowAt = new Map(rows.map((row) => [`${row.employeeId}|${row.workDate}`, row]));
      const shifts = new Map(
        (await tx.select({ id: workShifts.id, name: workShifts.name, startTime: workShifts.startTime, endTime: workShifts.endTime }).from(workShifts)).map((s) => [s.id, s]),
      );
      const cellsOf = await this.cellsFor(tx, targets, from, to, today);

      const changes: { employeeId: string; date: string; before: string; after: string }[] = [];
      for (const employee of targets) {
        for (const date of targetDates) {
          const source = rowAt.get(`${employee.id}|${addDays(date, -7)}`);
          if (!source) continue;
          if (cellsOf(employee.id, date).lock) {
            counts.skippedLocked += 1;
            continue;
          }
          let values: { workShiftId: string | null; shiftName: string | null; startTime: string | null; endTime: string | null };
          if (source.shiftName === null) {
            values = { workShiftId: null, shiftName: null, startTime: null, endTime: null };
          } else {
            const shift = source.workShiftId ? shifts.get(source.workShiftId) : undefined;
            if (!shift) {
              counts.skippedDeletedShift += 1;
              continue;
            }
            values = { workShiftId: shift.id, shiftName: shift.name, startTime: shift.startTime, endTime: shift.endTime };
          }
          const existing = rowAt.get(`${employee.id}|${date}`);
          const before = existing ? rosterEntryText(rosterEntryOf(existing)) : rosterEntryText(null);
          const after = rosterEntryText(rosterEntryOf(values));
          counts.filled += 1;
          if (existing && before !== after) counts.overwritten += 1;
          if (before === after) continue;
          changes.push({ employeeId: employee.id, date, before, after });
          if (!input.dryRun) {
            await tx
              .insert(shiftRosterDays)
              .values({ tenantId: ctx.tenantId, employeeId: employee.id, workDate: date, ...values, updatedByUserId: user.userId })
              .onConflictDoUpdate({
                target: [shiftRosterDays.tenantId, shiftRosterDays.employeeId, shiftRosterDays.workDate],
                set: { ...values, updatedByUserId: user.userId },
              });
          }
        }
      }

      const changedEmployees = [...new Set(changes.map((change) => change.employeeId))];
      if (!input.dryRun) {
        for (const employeeId of changedEmployees) {
          const own = changes.filter((change) => change.employeeId === employeeId);
          await this.audit.record(tx, ctx, {
            entity: "employee",
            entityId: employeeId,
            action: "copy_roster",
            before: own.map((change) => ({ date: change.date, entry: change.before })),
            after: own.map((change) => ({ date: change.date, entry: change.after })),
          });
        }
      }
      return { counts, changedEmployees: input.dryRun ? [] : changedEmployees };
    });
    await this.notify(ctx.tenantId, result.changedEmployees);
    return result.counts;
  }

  // Portal "Jadwal saya": hari ini + 6 hari untuk karyawan mode shift
  async mySchedule(user: AuthUser): Promise<MySchedule> {
    const ctx = tenantContextOf(user);
    return withTenant(this.db, ctx, async (tx) => {
      const { today, timeZone } = await this.todayOf(tx, ctx);
      const own = await this.attendance.ownEmployee(tx, user.userId);
      const [employee] = own ? await tx.select({ scheduleMode: employees.scheduleMode }).from(employees).where(eq(employees.id, own.id)) : [];
      if (!own || employee?.scheduleMode !== "shift") return { mode: "business", today, timeZone, days: [] };
      const dates = weekDates(today, MY_SCHEDULE_DAYS);
      const entries = await this.entriesBetween(tx, own.id, today, dates[dates.length - 1] ?? today);
      return { mode: "shift", today, timeZone, days: dates.map((date) => ({ date, entry: entries.get(date) ?? null })) };
    });
  }

  // ——— dipakai WorkShiftsService (ubah/hapus master shift) ———

  // Baris roster shift ini dari hari ini ke depan yang belum terkunci (boleh ikut diubah/dihapus)
  async unlockedRowsOfShift(tx: Transaction, ctx: TenantContext, shiftId: string): Promise<{ id: string; employeeId: string; workDate: string }[]> {
    const { today } = await this.todayOf(tx, ctx);
    const rows = await tx
      .select({ id: shiftRosterDays.id, employeeId: shiftRosterDays.employeeId, workDate: shiftRosterDays.workDate })
      .from(shiftRosterDays)
      .where(and(eq(shiftRosterDays.workShiftId, shiftId), gte(shiftRosterDays.workDate, today)));
    if (rows.length === 0) return [];
    const ids = [...new Set(rows.map((row) => row.employeeId))];
    const employment = await tx.select({ id: employees.id, joinDate: employees.joinDate, endDate: employees.endDate }).from(employees).where(inArray(employees.id, ids));
    const last = rows.reduce((max, row) => (row.workDate > max ? row.workDate : max), today);
    const cellsOf = await this.cellsFor(tx, employment, today, last, today);
    return rows.filter((row) => cellsOf(row.employeeId, row.workDate).lock === null);
  }

  async todayOf(tx: Transaction, ctx: TenantContext): Promise<{ today: string; timeZone: string }> {
    const timeZone = await this.attendance.tenantTimeZone(tx, ctx.tenantId);
    return { today: localClock(new Date(), timeZone).date, timeZone };
  }

  // Beberapa perubahan berdekatan digabung jadi satu email: job tertunda, jobId per karyawan per jendela waktu.
  // Gagal enqueue tidak membatalkan perubahan roster (karyawan tetap melihat jadwal di portal).
  async notify(tenantId: string, employeeIds: readonly string[]): Promise<void> {
    const bucket = Math.floor(Date.now() / ROSTER_NOTIFY_DELAY_MS);
    for (const employeeId of employeeIds) {
      try {
        await this.queue.add(ROSTER_NOTIFY_JOB, { tenantId, employeeId }, { jobId: `roster-notify_${tenantId}_${employeeId}_${bucket}`, delay: ROSTER_NOTIFY_DELAY_MS });
      } catch (error: unknown) {
        this.logger.error(`[roster/notify] gagal enqueue ${employeeId}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  // ——— helper ———

  // Isi & kunci sel untuk karyawan × rentang tanggal: roster, absen, periode gaji final, masa kerja
  private async cellsFor(
    tx: Transaction,
    targets: readonly EmploymentRow[],
    from: string,
    to: string,
    today: string,
  ): Promise<(employeeId: string, date: string) => RosterCell> {
    const ids = targets.map((employee) => employee.id);
    const entries = new Map<string, RosterEntry>();
    const attended = new Set<string>();
    if (ids.length > 0) {
      const rows = await tx
        .select({
          employeeId: shiftRosterDays.employeeId,
          workDate: shiftRosterDays.workDate,
          workShiftId: shiftRosterDays.workShiftId,
          shiftName: shiftRosterDays.shiftName,
          startTime: shiftRosterDays.startTime,
          endTime: shiftRosterDays.endTime,
        })
        .from(shiftRosterDays)
        .where(and(inArray(shiftRosterDays.employeeId, ids), between(shiftRosterDays.workDate, from, to)));
      for (const row of rows) entries.set(`${row.employeeId}|${row.workDate}`, rosterEntryOf(row));
      const records = await tx
        .select({ employeeId: attendanceRecords.employeeId, workDate: attendanceRecords.workDate })
        .from(attendanceRecords)
        .where(and(inArray(attendanceRecords.employeeId, ids), between(attendanceRecords.workDate, from, to)));
      for (const record of records) attended.add(`${record.employeeId}|${record.workDate}`);
    }
    const finalRanges = await this.finalRanges(tx, from, to);
    const employment = new Map(targets.map((employee) => [employee.id, employee]));
    return (employeeId, date) => {
      const key = `${employeeId}|${date}`;
      const employee = employment.get(employeeId);
      const lock = employee
        ? rosterLockReason(date, { today, joinDate: employee.joinDate, endDate: employee.endDate, attended: attended.has(key), finalRanges })
        : "not_employed";
      return { date, entry: entries.get(key) ?? null, lock };
    };
  }

  private async finalRanges(tx: Transaction, from: string, to: string): Promise<FinalRange[]> {
    const runs = await tx
      .select({ periodStart: payrollRuns.periodStart, periodEnd: payrollRuns.periodEnd })
      .from(payrollRuns)
      .where(and(eq(payrollRuns.status, "final"), lte(payrollRuns.periodStart, to), gte(payrollRuns.periodEnd, from)));
    // CHECK payroll_runs_final menjamin rentang terisi untuk status final
    return runs.flatMap((run) => (run.periodStart && run.periodEnd ? [{ from: run.periodStart, to: run.periodEnd }] : []));
  }

  private async entryAt(tx: Transaction, employeeId: string, date: string): Promise<RosterEntry | null> {
    return (await this.entriesBetween(tx, employeeId, date, date)).get(date) ?? null;
  }

  private async entriesBetween(tx: Transaction, employeeId: string, from: string, to: string): Promise<Map<string, RosterEntry>> {
    const rows = await tx
      .select({
        workDate: shiftRosterDays.workDate,
        workShiftId: shiftRosterDays.workShiftId,
        shiftName: shiftRosterDays.shiftName,
        startTime: shiftRosterDays.startTime,
        endTime: shiftRosterDays.endTime,
      })
      .from(shiftRosterDays)
      .where(and(eq(shiftRosterDays.employeeId, employeeId), between(shiftRosterDays.workDate, from, to)));
    return new Map(rows.map((row) => [row.workDate, rosterEntryOf(row)]));
  }

  private async shiftValues(tx: Transaction, shiftId: string): Promise<{ workShiftId: string; shiftName: string; startTime: string; endTime: string }> {
    const [shift] = await tx
      .select({ id: workShifts.id, name: workShifts.name, startTime: workShifts.startTime, endTime: workShifts.endTime })
      .from(workShifts)
      .where(eq(workShifts.id, shiftId));
    if (!shift) throw new NotFoundException("Shift tidak ditemukan — muat ulang halaman");
    return { workShiftId: shift.id, shiftName: shift.name, startTime: shift.startTime, endTime: shift.endTime };
  }

  private async requireViewer(tx: Transaction, ctx: TenantContext): Promise<AttendanceViewer> {
    const viewer = await loadAttendanceViewer(tx, ctx);
    if (!viewer) throw new ForbiddenException("Anda tidak memiliki akses ke halaman ini");
    return viewer;
  }
}

function lockMessage(lock: NonNullable<RosterCell["lock"]>): string {
  if (lock === "not_employed") return "Tanggal ini di luar masa kerja karyawan";
  if (lock === "payroll_final") return "Periode gaji tanggal ini sudah final — roster tidak bisa diubah";
  if (lock === "attended") return "Karyawan sudah absen di tanggal ini — ubah lewat koreksi absensi";
  return "Tanggal sudah lewat — ubah lewat koreksi absensi";
}

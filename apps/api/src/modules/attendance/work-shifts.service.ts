import { employees, shiftRosterDays, workShifts } from "@exapay/db";
import { isOvernightShift, shiftDurationMinutes, WORK_SHIFTS_MAX, type WorkShift, type WorkShiftInput, type WorkShiftList } from "@exapay/shared";
import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, asc, between, count, countDistinct, eq, gte, inArray, isNull } from "drizzle-orm";

import { type AuthUser, tenantContextOf } from "../../common/auth/auth-user.js";
import { DRIZZLE } from "../../database/database.module.js";
import { isUniqueViolation } from "../../database/errors.js";
import { type Database, type TenantContext, type Transaction, withTenant } from "../../database/tenant-transaction.js";
import { AuditService } from "../audit/audit.service.js";
import { loadAttendanceViewer } from "./attendance-viewer.js";
import { weekDates, weekStartOf } from "./shift-roster.js";
import { ShiftRosterService } from "./shift-roster.service.js";

type ShiftRow = { id: string; name: string; startTime: string; endTime: string };

const shiftColumns = { id: workShifts.id, name: workShifts.name, startTime: workShifts.startTime, endTime: workShifts.endTime };

// Kolom `time` dibaca "08:00:00" → "08:00"
const hhmm = (value: string): string => value.slice(0, 5);

const auditOf = (row: ShiftRow) => ({ name: row.name, startTime: hhmm(row.startTime), endTime: hhmm(row.endTime) });

// Master shift (feature 46, section "Shift kerja" di Pengaturan › Absensi). Daftar: semua staf (pemilih shift di roster);
// kelola: owner/admin (peran dibaca ulang dari DB). Ubah jam → roster yang belum terkunci ikut diperbarui; hapus →
// roster belum terkunci dikosongkan, yang terkunci menyimpan snapshot (FK SET NULL). Karyawan terdampak diberi tahu.
@Injectable()
export class WorkShiftsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly audit: AuditService,
    private readonly roster: ShiftRosterService,
  ) {}

  async list(user: AuthUser): Promise<WorkShiftList> {
    const ctx = tenantContextOf(user);
    return withTenant(this.db, ctx, async (tx) => {
      const viewer = await loadAttendanceViewer(tx, ctx);
      if (!viewer) throw new ForbiddenException("Anda tidak memiliki akses ke halaman ini");
      const rows = await tx.select(shiftColumns).from(workShifts).orderBy(asc(workShifts.startTime), asc(workShifts.name));
      const [shiftEmployees] = await tx
        .select({ total: count() })
        .from(employees)
        .where(and(eq(employees.scheduleMode, "shift"), isNull(employees.endDate)));
      return { items: await this.withUsage(tx, ctx, rows), shiftEmployeeCount: shiftEmployees?.total ?? 0, canManage: viewer.manage };
    });
  }

  async create(user: AuthUser, input: WorkShiftInput): Promise<WorkShift> {
    const ctx = tenantContextOf(user);
    return this.withNameGuard(() =>
      withTenant(this.db, ctx, async (tx) => {
        await this.requireManager(tx, ctx);
        const [total] = await tx.select({ total: count() }).from(workShifts);
        if ((total?.total ?? 0) >= WORK_SHIFTS_MAX) throw new BadRequestException(`Maksimal ${WORK_SHIFTS_MAX} shift per usaha`);
        const [row] = await tx.insert(workShifts).values({ tenantId: ctx.tenantId, ...input }).returning(shiftColumns);
        if (!row) throw new Error("[work-shifts/create] insert tidak mengembalikan baris");
        await this.audit.record(tx, ctx, { entity: "work_shift", entityId: row.id, action: "create", after: auditOf(row) });
        const [shift] = await this.withUsage(tx, ctx, [row]);
        if (!shift) throw new Error("[work-shifts/create] ringkasan shift kosong");
        return shift;
      }),
    );
  }

  async update(user: AuthUser, id: string, input: WorkShiftInput): Promise<WorkShift> {
    const ctx = tenantContextOf(user);
    const result = await this.withNameGuard(() =>
      withTenant(this.db, ctx, async (tx) => {
        await this.requireManager(tx, ctx);
        const [before] = await tx.select(shiftColumns).from(workShifts).where(eq(workShifts.id, id)).for("update");
        if (!before) throw new NotFoundException("Shift tidak ditemukan");
        const [row] = await tx.update(workShifts).set(input).where(eq(workShifts.id, id)).returning(shiftColumns);
        if (!row) throw new NotFoundException("Shift tidak ditemukan");

        // Roster yang belum terkunci memakai nama & jam baru; yang terkunci tetap snapshot lama
        const unlocked = await this.roster.unlockedRowsOfShift(tx, ctx, id);
        const changedTimes = hhmm(before.startTime) !== hhmm(row.startTime) || hhmm(before.endTime) !== hhmm(row.endTime) || before.name !== row.name;
        if (changedTimes && unlocked.length > 0) {
          await tx
            .update(shiftRosterDays)
            .set({ shiftName: row.name, startTime: row.startTime, endTime: row.endTime })
            .where(inArray(shiftRosterDays.id, unlocked.map((r) => r.id)));
        }
        await this.audit.record(tx, ctx, {
          entity: "work_shift",
          entityId: id,
          action: "update",
          before: auditOf(before),
          after: { ...auditOf(row), rosterDaysUpdated: changedTimes ? unlocked.length : 0 },
        });
        const [shift] = await this.withUsage(tx, ctx, [row]);
        if (!shift) throw new Error("[work-shifts/update] ringkasan shift kosong");
        return { shift, affected: changedTimes ? unlocked.map((r) => r.employeeId) : [] };
      }),
    );
    await this.roster.notify(ctx.tenantId, [...new Set(result.affected)]);
    return result.shift;
  }

  async remove(user: AuthUser, id: string): Promise<void> {
    const ctx = tenantContextOf(user);
    const affected = await withTenant(this.db, ctx, async (tx) => {
      await this.requireManager(tx, ctx);
      const [before] = await tx.select(shiftColumns).from(workShifts).where(eq(workShifts.id, id)).for("update");
      if (!before) throw new NotFoundException("Shift tidak ditemukan");
      const unlocked = await this.roster.unlockedRowsOfShift(tx, ctx, id);
      if (unlocked.length > 0) await tx.delete(shiftRosterDays).where(inArray(shiftRosterDays.id, unlocked.map((r) => r.id)));
      // Baris roster terkunci: work_shift_id → null (FK ON DELETE SET NULL), snapshot nama & jam tetap
      await tx.delete(workShifts).where(eq(workShifts.id, id));
      await this.audit.record(tx, ctx, { entity: "work_shift", entityId: id, action: "delete", before: { ...auditOf(before), rosterDaysCleared: unlocked.length } });
      return [...new Set(unlocked.map((r) => r.employeeId))];
    });
    await this.roster.notify(ctx.tenantId, affected);
  }

  // ——— helper ———

  private async withUsage(tx: Transaction, ctx: TenantContext, rows: ShiftRow[]): Promise<WorkShift[]> {
    if (rows.length === 0) return [];
    const { today } = await this.roster.todayOf(tx, ctx);
    const week = weekDates(weekStartOf(today));
    const ids = rows.map((row) => row.id);
    const upcoming = await tx
      .select({ shiftId: shiftRosterDays.workShiftId, total: count() })
      .from(shiftRosterDays)
      .where(and(inArray(shiftRosterDays.workShiftId, ids), gte(shiftRosterDays.workDate, today)))
      .groupBy(shiftRosterDays.workShiftId);
    const thisWeek = await tx
      .select({ shiftId: shiftRosterDays.workShiftId, total: countDistinct(shiftRosterDays.employeeId) })
      .from(shiftRosterDays)
      .where(and(inArray(shiftRosterDays.workShiftId, ids), between(shiftRosterDays.workDate, week[0] ?? today, week[week.length - 1] ?? today)))
      .groupBy(shiftRosterDays.workShiftId);
    return rows.map((row) => {
      const startTime = hhmm(row.startTime);
      const endTime = hhmm(row.endTime);
      return {
        id: row.id,
        name: row.name,
        startTime,
        endTime,
        overnight: isOvernightShift(startTime, endTime),
        durationMinutes: shiftDurationMinutes(startTime, endTime),
        upcomingAssignments: upcoming.find((u) => u.shiftId === row.id)?.total ?? 0,
        employeesThisWeek: thisWeek.find((w) => w.shiftId === row.id)?.total ?? 0,
      };
    });
  }

  private async requireManager(tx: Transaction, ctx: TenantContext): Promise<void> {
    const viewer = await loadAttendanceViewer(tx, ctx);
    if (!viewer?.manage) throw new ForbiddenException("Hanya pemilik atau admin yang dapat mengatur shift");
  }

  private async withNameGuard<T>(run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (error: unknown) {
      if (isUniqueViolation(error)) throw new ConflictException("Nama shift sudah dipakai — gunakan nama lain");
      throw error;
    }
  }
}

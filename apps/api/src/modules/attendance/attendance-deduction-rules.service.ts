import { attendanceDeductionRules, attendanceRecords, employees, leaveRequests, positions, users } from "@exapay/db";
import { calculateAttendanceDeduction } from "@exapay/payroll-engine";
import type {
  AttendanceDeductionPreview,
  AttendanceDeductionPreviewInput,
  AttendanceDeductionRuleVersion,
  AttendanceDeductionSettings,
  LeaveType,
  SaveAttendanceDeductionRulesInput,
} from "@exapay/shared";
import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, asc, between, desc, eq, gte, lte } from "drizzle-orm";

import { type AuthUser, tenantContextOf } from "../../common/auth/auth-user.js";
import { DRIZZLE } from "../../database/database.module.js";
import { exclusionViolationConstraint } from "../../database/errors.js";
import { type Database, type TenantContext, type Transaction, withTenant } from "../../database/tenant-transaction.js";
import { AuditService } from "../audit/audit.service.js";
import { localClock, monthRange } from "./attendance-clock.js";
import { type DeductionLeave, deductionFacts } from "./attendance-deduction-facts.js";
import { columnsToRules, previousDate, type RuleColumns, rulesToColumns, versionStatus } from "./attendance-deduction-rules.js";
import { recapEmployee } from "./attendance-recap.js";
import { loadAttendanceViewer } from "./attendance-viewer.js";
import { AttendanceService } from "./attendance.service.js";
import { countWorkingDays } from "./work-calendar.js";
import { WorkCalendarService } from "./work-calendar.service.js";

const ENTITY = "attendance_deduction_rule";

const versionColumns = {
  id: attendanceDeductionRules.id,
  effectiveFrom: attendanceDeductionRules.effectiveFrom,
  effectiveTo: attendanceDeductionRules.effectiveTo,
  absenceMode: attendanceDeductionRules.absenceMode,
  absenceProrateBase: attendanceDeductionRules.absenceProrateBase,
  absenceDivisorMode: attendanceDeductionRules.absenceDivisorMode,
  absenceDivisorDays: attendanceDeductionRules.absenceDivisorDays,
  absenceAmountPerDay: attendanceDeductionRules.absenceAmountPerDay,
  lateMode: attendanceDeductionRules.lateMode,
  lateToleranceMinutes: attendanceDeductionRules.lateToleranceMinutes,
  lateBlockMinutes: attendanceDeductionRules.lateBlockMinutes,
  lateAmount: attendanceDeductionRules.lateAmount,
  lateMonthlyCap: attendanceDeductionRules.lateMonthlyCap,
  permitSickMode: attendanceDeductionRules.permitSickMode,
  permitSickFreeDays: attendanceDeductionRules.permitSickFreeDays,
  allowanceMode: attendanceDeductionRules.allowanceMode,
  allowanceMinAbsentDays: attendanceDeductionRules.allowanceMinAbsentDays,
  allowanceAmountPerDay: attendanceDeductionRules.allowanceAmountPerDay,
  createdByName: attendanceDeductionRules.createdByName,
  createdAt: attendanceDeductionRules.createdAt,
};

type VersionRow = RuleColumns & {
  id: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  createdByName: string | null;
  createdAt: Date;
};

function toVersion(row: VersionRow, today: string): AttendanceDeductionRuleVersion {
  return {
    id: row.id,
    effectiveFrom: row.effectiveFrom,
    effectiveTo: row.effectiveTo,
    status: versionStatus(row.effectiveFrom, row.effectiveTo, today),
    rules: columnsToRules(row),
    createdByName: row.createdByName,
    createdAt: row.createdAt.toISOString(),
  };
}

// Aturan potongan absensi (feature 17): versi aturan per usaha + pratinjau untuk satu karyawan.
// Owner/admin saja (peran dibaca ulang dari DB). Perhitungan di payroll-engine, bukan di sini.
@Injectable()
export class AttendanceDeductionRulesService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly attendance: AttendanceService,
    private readonly workCalendar: WorkCalendarService,
    private readonly audit: AuditService,
  ) {}

  async settings(user: AuthUser): Promise<AttendanceDeductionSettings> {
    const ctx = tenantContextOf(user);
    return withTenant(this.db, ctx, async (tx) => {
      await this.requireManager(tx, ctx);
      const today = await this.today(tx, ctx);
      const rows = await this.selectVersions(tx);
      return { today, versions: rows.map((row) => toVersion(row, today)) };
    });
  }

  // Simpan = versi baru mulai `effectiveFrom` (≥ hari ini). Versi yang berjalan ditutup sehari sebelumnya; versi
  // terjadwal yang mulai pada/sesudah tanggal itu belum pernah berlaku → dihapus (tercatat di audit log).
  async save(user: AuthUser, input: SaveAttendanceDeductionRulesInput): Promise<AttendanceDeductionSettings> {
    const ctx = tenantContextOf(user);
    try {
      return await withTenant(this.db, ctx, async (tx) => {
        await this.requireManager(tx, ctx);
        const today = await this.today(tx, ctx);
        if (input.effectiveFrom < today) throw new BadRequestException("Tanggal berlaku tidak boleh sebelum hari ini");

        // Kunci semua versi usaha ini — dua penyimpanan bersamaan diproses bergantian
        const existing = await this.selectVersions(tx, true);
        for (const row of existing.filter((version) => version.effectiveFrom >= input.effectiveFrom)) {
          await tx.delete(attendanceDeductionRules).where(eq(attendanceDeductionRules.id, row.id));
          await this.audit.record(tx, ctx, {
            entity: ENTITY,
            entityId: row.id,
            action: "delete",
            before: { effectiveFrom: row.effectiveFrom, effectiveTo: row.effectiveTo, rules: columnsToRules(row) },
          });
        }
        const running = existing.find(
          (version) => version.effectiveFrom < input.effectiveFrom && (version.effectiveTo === null || version.effectiveTo >= input.effectiveFrom),
        );
        if (running) {
          const effectiveTo = previousDate(input.effectiveFrom);
          await tx.update(attendanceDeductionRules).set({ effectiveTo }).where(eq(attendanceDeductionRules.id, running.id));
          await this.audit.record(tx, ctx, {
            entity: ENTITY,
            entityId: running.id,
            action: "close",
            before: { effectiveTo: running.effectiveTo },
            after: { effectiveTo },
          });
        }

        const [actor] = await tx.select({ fullName: users.fullName }).from(users).where(eq(users.id, user.userId));
        const [created] = await tx
          .insert(attendanceDeductionRules)
          .values({
            tenantId: ctx.tenantId,
            effectiveFrom: input.effectiveFrom,
            effectiveTo: null,
            ...rulesToColumns(input.rules),
            createdByUserId: user.userId,
            createdByName: actor?.fullName ?? null,
          })
          .returning({ id: attendanceDeductionRules.id });
        if (!created) throw new Error("[attendance-deduction/save] insert tidak mengembalikan baris");
        await this.audit.record(tx, ctx, {
          entity: ENTITY,
          entityId: created.id,
          action: "create",
          after: { effectiveFrom: input.effectiveFrom, rules: input.rules },
        });

        const rows = await this.selectVersions(tx);
        return { today, versions: rows.map((row) => toVersion(row, today)) };
      });
    } catch (error) {
      // Seharusnya tidak terjadi (versi dikunci) — jaga-jaga dari penyimpanan bersamaan yang lolos
      if (exclusionViolationConstraint(error) === "attendance_deduction_rules_no_overlap") {
        throw new ConflictException("Aturan baru saja diubah pengguna lain. Muat ulang halaman lalu coba lagi.");
      }
      throw error;
    }
  }

  // Pratinjau: rekap absensi nyata karyawan di bulan terpilih + gaji isian (belum ada komponen gaji — feature 28).
  // Aturan dari form (belum tentu disimpan) agar admin bisa mencoba sebelum menyimpan.
  async preview(user: AuthUser, input: AttendanceDeductionPreviewInput): Promise<AttendanceDeductionPreview> {
    const ctx = tenantContextOf(user);
    return withTenant(this.db, ctx, async (tx) => {
      await this.requireManager(tx, ctx);
      const [employee] = await tx
        .select({ id: employees.id, fullName: employees.fullName, positionName: positions.name, joinDate: employees.joinDate, endDate: employees.endDate })
        .from(employees)
        .innerJoin(positions, eq(positions.id, employees.positionId))
        .where(eq(employees.id, input.employeeId));
      if (!employee) throw new NotFoundException("Karyawan tidak ditemukan");

      const today = await this.today(tx, ctx);
      const period = monthRange(input.month);
      const calendar = await this.workCalendar.loadCalendar(tx, period.from, period.to);
      const records = (
        await tx
          .select({ workDate: attendanceRecords.workDate, lateMinutes: attendanceRecords.lateMinutes, checkOutAt: attendanceRecords.checkOutAt })
          .from(attendanceRecords)
          .where(and(eq(attendanceRecords.employeeId, employee.id), between(attendanceRecords.workDate, period.from, period.to)))
      ).map((row) => ({ workDate: row.workDate, lateMinutes: row.lateMinutes, hasCheckOut: row.checkOutAt !== null }));
      const leaves = await this.selectApprovedLeaves(tx, employee.id, period.from, period.to);

      const recap = recapEmployee({ calendar, ...period, today, employment: employee, records, leaves });
      const facts = deductionFacts({ days: recap.days, records, leaves, periodWorkingDays: countWorkingDays(calendar, period.from, period.to) });
      const result = calculateAttendanceDeduction({
        rules: input.rules,
        salary: { baseSalary: input.baseSalary, fixedAllowances: input.fixedAllowances, attendanceAllowance: input.attendanceAllowance },
        facts,
      });
      return { employee: { id: employee.id, fullName: employee.fullName, positionName: employee.positionName }, ...period, today, facts, result };
    });
  }

  // ——— helper ———

  private async requireManager(tx: Transaction, ctx: TenantContext): Promise<void> {
    const viewer = await loadAttendanceViewer(tx, ctx);
    if (!viewer?.manage) throw new ForbiddenException("Hanya pemilik atau admin yang dapat mengatur potongan absensi");
  }

  private async today(tx: Transaction, ctx: TenantContext): Promise<string> {
    return localClock(new Date(), await this.attendance.tenantTimeZone(tx, ctx.tenantId)).date;
  }

  // Terbaru di atas. `lock` = FOR UPDATE (penyimpanan versi baru)
  private selectVersions(tx: Transaction, lock = false): Promise<VersionRow[]> {
    const query = tx.select(versionColumns).from(attendanceDeductionRules).orderBy(desc(attendanceDeductionRules.effectiveFrom));
    return lock ? query.for("update") : query;
  }

  private async selectApprovedLeaves(tx: Transaction, employeeId: string, from: string, to: string): Promise<DeductionLeave[]> {
    const rows: { type: LeaveType; startDate: string; endDate: string; attachmentKey: string | null }[] = await tx
      .select({ type: leaveRequests.type, startDate: leaveRequests.startDate, endDate: leaveRequests.endDate, attachmentKey: leaveRequests.attachmentKey })
      .from(leaveRequests)
      .where(
        and(
          eq(leaveRequests.employeeId, employeeId),
          eq(leaveRequests.status, "approved"),
          lte(leaveRequests.startDate, to),
          gte(leaveRequests.endDate, from),
        ),
      )
      .orderBy(asc(leaveRequests.startDate));
    return rows.map((row) => ({ type: row.type, startDate: row.startDate, endDate: row.endDate, hasDocument: row.attachmentKey !== null }));
  }
}

import { complianceDeadlines, complianceReminders, employees, tenants, users } from "@exapay/db";
import {
  type ComplianceCalendar,
  complianceDaysBetween,
  type ComplianceReminder,
  type ComplianceReminderItem,
  complianceRemindersBetween,
  type ComplianceSource,
  COMPLIANCE_OVERDUE_LOOKBACK_MONTHS,
  findComplianceReminder,
  shiftComplianceMonth,
} from "@exapay/shared";
import { ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";

import { type AuthUser, tenantContextOf } from "../../common/auth/auth-user.js";
import { DRIZZLE } from "../../database/database.module.js";
import { type Database, type TenantContext, type Transaction, withTenant } from "../../database/tenant-transaction.js";
import { localClock } from "../attendance/attendance-clock.js";
import { AttendanceService } from "../attendance/attendance.service.js";
import { loadAttendanceViewer } from "../attendance/attendance-viewer.js";
import { AuditService } from "../audit/audit.service.js";
import { MinimumWageService } from "../payroll/minimum-wage.service.js";

const NOT_FOUND = "Pengingat tidak ditemukan atau sudah tidak berlaku";

type ReminderState = { doneAt: Date | null; doneByName: string | null };

function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

function lastDayOf(month: string): string {
  return addDays(`${shiftComplianceMonth(month, 1)}-01`, -1);
}

// Kalender kepatuhan (feature 33) — owner/admin (peran dibaca ulang). Pengingat dihitung saat dibaca dari aturan tenggat
// (compliance_deadlines, data regulasi) + data karyawan lewat fungsi murni @exapay/shared — sama dengan worker email.
// compliance_reminders hanya menyimpan status selesai (+ jejak email dari worker). Peringatan upah minimum (feature 34)
// ikut dikirim sebagai keadaan hari ini (bukan pengingat bertanggal — tidak bisa ditandai selesai, hilang setelah gaji disesuaikan).
@Injectable()
export class ComplianceService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly attendance: AttendanceService,
    private readonly audit: AuditService,
    private readonly minimumWages: MinimumWageService,
  ) {}

  // month null = bulan berjalan (zona waktu usaha)
  async calendar(user: AuthUser, requestedMonth: string | null): Promise<ComplianceCalendar> {
    const ctx = tenantContextOf(user);
    return withTenant(this.db, ctx, async (tx) => {
      await this.requireManager(tx, ctx);
      const timeZone = await this.attendance.tenantTimeZone(tx, ctx.tenantId);
      const today = localClock(new Date(), timeZone).date;
      const currentMonth = today.slice(0, 7);
      const month = requestedMonth ?? currentMonth;
      const source = await this.loadSource(tx, ctx.tenantId, timeZone);

      const monthItems = complianceRemindersBetween(source, `${month}-01`, lastDayOf(month));
      const pastItems = complianceRemindersBetween(source, `${shiftComplianceMonth(currentMonth, -COMPLIANCE_OVERDUE_LOOKBACK_MONTHS)}-01`, addDays(today, -1));
      const weekItems = complianceRemindersBetween(source, today, addDays(today, 7));
      const states = await this.loadStates(tx, [...monthItems, ...pastItems, ...weekItems].map((item) => item.key));

      const toReminder = (item: ComplianceReminderItem): ComplianceReminder => {
        const state = states.get(item.key);
        const doneAt = state?.doneAt ?? null;
        return {
          ...item,
          daysUntil: complianceDaysBetween(today, item.dueDate),
          status: doneAt ? "done" : "open",
          doneAt: doneAt ? doneAt.toISOString() : null,
          doneByName: doneAt ? (state?.doneByName ?? null) : null,
        };
      };
      const reminders = monthItems.map(toReminder);
      const minimumWage = await this.minimumWages.summary(tx, ctx.tenantId);
      const overdue = pastItems.map(toReminder).filter((reminder) => reminder.status === "open");
      return {
        month,
        currentMonth,
        today,
        overdue,
        reminders,
        summary: {
          overdue: overdue.length,
          dueThisWeek: weekItems.filter((item) => !states.get(item.key)?.doneAt).length,
          openThisMonth: reminders.filter((reminder) => reminder.status === "open").length,
          doneThisMonth: reminders.filter((reminder) => reminder.status === "done").length,
        },
        minimumWage,
      };
    });
  }

  // Tandai selesai (idempoten: yang sudah selesai tidak berubah & tidak diaudit ulang)
  async complete(user: AuthUser, key: string): Promise<void> {
    const ctx = tenantContextOf(user);
    await withTenant(this.db, ctx, async (tx) => {
      await this.requireManager(tx, ctx);
      const item = await this.findReminder(tx, ctx, key);
      const [actor] = await tx.select({ fullName: users.fullName }).from(users).where(eq(users.id, user.userId));
      const done = { doneAt: sql`now()`, doneByUserId: user.userId, doneByName: actor?.fullName ?? "Pengguna" };
      const changed = await tx
        .insert(complianceReminders)
        .values({ tenantId: ctx.tenantId, key: item.key, kind: item.kind, dueDate: item.dueDate, ...done })
        .onConflictDoUpdate({ target: [complianceReminders.tenantId, complianceReminders.key], set: done, setWhere: isNull(complianceReminders.doneAt) })
        .returning({ id: complianceReminders.id });
      if (changed.length === 0) return;
      await this.audit.record(tx, ctx, {
        entity: "compliance_reminder",
        entityId: item.key,
        action: "complete",
        after: { kind: item.kind, dueDate: item.dueDate },
      });
    });
  }

  // Batalkan tanda selesai (idempoten)
  async reopen(user: AuthUser, key: string): Promise<void> {
    const ctx = tenantContextOf(user);
    await withTenant(this.db, ctx, async (tx) => {
      await this.requireManager(tx, ctx);
      const item = await this.findReminder(tx, ctx, key);
      const [before] = await tx
        .update(complianceReminders)
        .set({ doneAt: null, doneByUserId: null, doneByName: null })
        .where(and(eq(complianceReminders.key, item.key), isNotNull(complianceReminders.doneAt)))
        .returning({ id: complianceReminders.id });
      if (!before) return;
      await this.audit.record(tx, ctx, {
        entity: "compliance_reminder",
        entityId: item.key,
        action: "reopen",
        before: { kind: item.kind, dueDate: item.dueDate },
      });
    });
  }

  private async findReminder(tx: Transaction, ctx: TenantContext, key: string): Promise<ComplianceReminderItem> {
    const timeZone = await this.attendance.tenantTimeZone(tx, ctx.tenantId);
    const item = findComplianceReminder(await this.loadSource(tx, ctx.tenantId, timeZone), key);
    if (!item) throw new NotFoundException(NOT_FOUND);
    return item;
  }

  private async requireManager(tx: Transaction, ctx: TenantContext): Promise<void> {
    const viewer = await loadAttendanceViewer(tx, ctx);
    if (!viewer?.manage) throw new ForbiddenException("Hanya pemilik atau admin yang dapat membuka kalender kepatuhan");
  }

  // Masukan generator: aturan tenggat (data referensi platform — policy reference_read, terbaca di transaksi tenant),
  // karyawan usaha (RLS), dan tanggal usaha terdaftar (tenggat sebelumnya tidak diingatkan)
  private async loadSource(tx: Transaction, tenantId: string, timeZone: string): Promise<ComplianceSource> {
    const rules = await tx
      .select({
        kind: complianceDeadlines.kind,
        dueDay: complianceDeadlines.dueDay,
        monthOffset: complianceDeadlines.monthOffset,
        effectiveFrom: complianceDeadlines.effectiveFrom,
        effectiveTo: complianceDeadlines.effectiveTo,
      })
      .from(complianceDeadlines);
    const staff = await tx
      .select({
        id: employees.id,
        fullName: employees.fullName,
        employmentStatus: employees.employmentStatus,
        joinDate: employees.joinDate,
        endDate: employees.endDate,
        contractEndDate: employees.contractEndDate,
        probationEndDate: employees.probationEndDate,
      })
      .from(employees);
    // RLS juga memperlihatkan usaha lain milik user — filter eksplisit ke usaha aktif
    const [tenant] = await tx.select({ createdAt: tenants.createdAt }).from(tenants).where(eq(tenants.id, tenantId));
    return { rules, employees: staff, since: localClock(tenant?.createdAt ?? new Date(), timeZone).date };
  }

  private async loadStates(tx: Transaction, keys: string[]): Promise<Map<string, ReminderState>> {
    const unique = [...new Set(keys)];
    if (unique.length === 0) return new Map();
    const rows = await tx
      .select({ key: complianceReminders.key, doneAt: complianceReminders.doneAt, doneByName: complianceReminders.doneByName })
      .from(complianceReminders)
      .where(inArray(complianceReminders.key, unique));
    return new Map(rows.map((row) => [row.key, { doneAt: row.doneAt, doneByName: row.doneByName }]));
  }
}

import { departments, employees, employeeSalaries, payrollRuns, positions, setupGuideStates, tenants, workScheduleDays } from "@exapay/db";
import type { SetupGuide } from "@exapay/shared";
import { ConflictException, Inject, Injectable } from "@nestjs/common";
import { and, asc, eq, gt, inArray, isNull } from "drizzle-orm";

import { type AuthUser, tenantContextOf } from "../../common/auth/auth-user.js";
import { DRIZZLE } from "../../database/database.module.js";
import { type Database, type TenantContext, type Transaction, withTenant } from "../../database/tenant-transaction.js";
import { AuditService } from "../audit/audit.service.js";
import { setupGuideOf } from "./setup-guide.js";

type StateChange = { hiddenAt?: Date | null; scheduleCheckedAt?: Date; closedAt?: Date };

// Panduan setup awal (feature 48): status langkah dihitung dari data usaha; keputusan pengguna (lewati, jadwal dicek,
// tutup) disimpan di setup_guide_states + audit log. Hanya owner/admin (dibatasi controller).
@Injectable()
export class SetupGuideService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly audit: AuditService,
  ) {}

  async status(user: AuthUser): Promise<SetupGuide> {
    return withTenant(this.db, tenantContextOf(user), (tx) => this.load(tx, tenantContextOf(user)));
  }

  // Lewati (hidden=true) / buka lagi (false) — berlaku untuk seluruh usaha
  async setHidden(user: AuthUser, hidden: boolean): Promise<SetupGuide> {
    const ctx = tenantContextOf(user);
    return withTenant(this.db, ctx, async (tx) => {
      await this.change(tx, ctx, { hiddenAt: hidden ? new Date() : null }, hidden ? "hide" : "show");
      return this.load(tx, ctx);
    });
  }

  async markScheduleChecked(user: AuthUser): Promise<SetupGuide> {
    const ctx = tenantContextOf(user);
    return withTenant(this.db, ctx, async (tx) => {
      await this.change(tx, ctx, { scheduleCheckedAt: new Date() }, "schedule_checked");
      return this.load(tx, ctx);
    });
  }

  // Tutup kartu "Exapay siap dipakai" — hanya setelah semua langkah selesai; panduan tidak muncul lagi
  async close(user: AuthUser): Promise<SetupGuide> {
    const ctx = tenantContextOf(user);
    return withTenant(this.db, ctx, async (tx) => {
      const current = await this.load(tx, ctx);
      if (!current.allDone) throw new ConflictException("Panduan belum selesai — lewati panduan bila ingin menyembunyikannya");
      await this.change(tx, ctx, { closedAt: new Date() }, "close");
      return this.load(tx, ctx);
    });
  }

  private async change(tx: Transaction, ctx: TenantContext, values: StateChange, action: string): Promise<void> {
    await tx
      .insert(setupGuideStates)
      .values({ tenantId: ctx.tenantId, updatedByUserId: ctx.userId, ...values })
      .onConflictDoUpdate({ target: setupGuideStates.tenantId, set: { updatedByUserId: ctx.userId, ...values } });
    await this.audit.record(tx, ctx, { entity: "setup_guide", entityId: ctx.tenantId, action, after: { action } });
  }

  private async load(tx: Transaction, ctx: TenantContext): Promise<SetupGuide> {
    // RLS juga memperlihatkan usaha lain milik user — filter eksplisit ke usaha aktif
    const [tenant] = await tx.select({ regencyCode: tenants.regencyCode, payday: tenants.payday }).from(tenants).where(eq(tenants.id, ctx.tenantId));
    const [state] = await tx
      .select({ hiddenAt: setupGuideStates.hiddenAt, scheduleCheckedAt: setupGuideStates.scheduleCheckedAt, closedAt: setupGuideStates.closedAt })
      .from(setupGuideStates);
    const [department] = await tx.select({ id: departments.id }).from(departments).limit(1);
    const [position] = await tx.select({ id: positions.id }).from(positions).limit(1);
    // Jadwal bawaan: updated_at = created_at; disimpan ulang dengan perubahan → trigger memperbarui updated_at
    const [editedDay] = await tx
      .select({ weekday: workScheduleDays.weekday })
      .from(workScheduleDays)
      .where(gt(workScheduleDays.updatedAt, workScheduleDays.createdAt))
      .limit(1);
    const active = await tx
      .select({ id: employees.id, userId: employees.userId })
      .from(employees)
      .where(isNull(employees.endDate))
      .orderBy(asc(employees.fullName));
    const salaried =
      active.length === 0
        ? []
        : await tx
            .selectDistinct({ employeeId: employeeSalaries.employeeId })
            .from(employeeSalaries)
            .where(
              and(
                inArray(
                  employeeSalaries.employeeId,
                  active.map((employee) => employee.id),
                ),
                isNull(employeeSalaries.effectiveTo),
              ),
            );
    const salariedIds = new Set(salaried.map((row) => row.employeeId));
    const [run] = await tx.select({ id: payrollRuns.id }).from(payrollRuns).limit(1);

    return setupGuideOf({
      profileComplete: tenant?.regencyCode != null && tenant.payday != null,
      hasDepartment: department !== undefined,
      hasPosition: position !== undefined,
      scheduleReviewed: editedDay !== undefined || state?.scheduleCheckedAt != null,
      activeEmployees: active.map((employee) => ({ id: employee.id, hasSalary: salariedIds.has(employee.id), hasAccount: employee.userId !== null })),
      hasPayrollRun: run !== undefined,
      hidden: state?.hiddenAt != null,
      closed: state?.closedAt != null,
    });
  }
}

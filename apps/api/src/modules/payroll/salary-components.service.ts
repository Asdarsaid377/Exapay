import { employees, employeeSalaries, employeeSalaryItems, salaryComponents, tenants } from "@exapay/db";
import {
  JKK_RISK_LEVELS,
  type JkkRiskLevel,
  type JkkRiskLevelInput,
  type SalaryComponent,
  type SalaryComponentInput,
  type SalaryComponentSettings,
} from "@exapay/shared";
import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { asc, countDistinct, eq, max, sql } from "drizzle-orm";

import { type AuthUser, tenantContextOf } from "../../common/auth/auth-user.js";
import { DRIZZLE } from "../../database/database.module.js";
import { foreignKeyViolationConstraint, uniqueViolationConstraint } from "../../database/errors.js";
import { type Database, type TenantContext, type Transaction, withTenant } from "../../database/tenant-transaction.js";
import { localClock } from "../attendance/attendance-clock.js";
import { AttendanceService } from "../attendance/attendance.service.js";
import { AuditService } from "../audit/audit.service.js";
import { requireSalaryManager } from "./salary-access.js";

const ENTITY = "salary_component";

const componentColumns = {
  id: salaryComponents.id,
  name: salaryComponents.name,
  kind: salaryComponents.kind,
  builtinKey: salaryComponents.builtinKey,
  archivedAt: salaryComponents.archivedAt,
};
type ComponentRow = { id: string; name: string; kind: SalaryComponent["kind"]; builtinKey: string | null; archivedAt: Date | null };

// Pesan pelanggaran constraint katalog → 409
function conflictMessage(error: unknown): string | null {
  switch (uniqueViolationConstraint(error)) {
    case "salary_components_tenant_name_key":
      return "Nama komponen sudah dipakai";
    case "salary_components_tenant_single_kind_key":
      return "Usaha hanya boleh punya satu komponen aktif berjenis gaji pokok dan satu tunjangan kehadiran";
    default:
      return null;
  }
}

export function toJkkRiskLevel(value: number): JkkRiskLevel {
  const level = JKK_RISK_LEVELS.find((candidate) => candidate === value);
  if (level === undefined) throw new Error(`[salary-components] kelompok risiko JKK tidak valid: ${value}`);
  return level;
}

// Katalog komponen gaji & kelompok risiko JKK usaha (feature 28, /settings/salary-components) — owner/admin.
// Komponen yang sudah dipakai di gaji karyawan tidak bisa dihapus (FK RESTRICT) atau diganti jenisnya — cukup diarsipkan.
@Injectable()
export class SalaryComponentsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly attendance: AttendanceService,
    private readonly audit: AuditService,
  ) {}

  async settings(user: AuthUser): Promise<SalaryComponentSettings> {
    const ctx = tenantContextOf(user);
    return withTenant(this.db, ctx, async (tx) => {
      await requireSalaryManager(tx, ctx);
      return this.loadSettings(tx, ctx);
    });
  }

  async create(user: AuthUser, input: SalaryComponentInput): Promise<SalaryComponentSettings> {
    const ctx = tenantContextOf(user);
    return this.mutate(ctx, async (tx) => {
      const [last] = await tx.select({ sortOrder: max(salaryComponents.sortOrder) }).from(salaryComponents);
      const [created] = await tx
        .insert(salaryComponents)
        .values({ tenantId: ctx.tenantId, name: input.name, kind: input.kind, sortOrder: (last?.sortOrder ?? 0) + 1 })
        .returning({ id: salaryComponents.id });
      if (!created) throw new Error("[salary-components/create] insert tidak mengembalikan baris");
      await this.audit.record(tx, ctx, { entity: ENTITY, entityId: created.id, action: "create", after: input });
    });
  }

  async update(user: AuthUser, id: string, input: SalaryComponentInput): Promise<SalaryComponentSettings> {
    const ctx = tenantContextOf(user);
    return this.mutate(ctx, async (tx) => {
      const current = await this.lockComponent(tx, id);
      if (input.kind !== current.kind) {
        if (current.kind === "base_salary") throw new BadRequestException("Jenis gaji pokok tidak bisa diubah");
        if (await this.isInUse(tx, id)) {
          throw new ConflictException("Jenis komponen yang sudah dipakai di gaji karyawan tidak bisa diubah. Buat komponen baru lalu arsipkan yang ini.");
        }
      }
      await tx.update(salaryComponents).set({ name: input.name, kind: input.kind }).where(eq(salaryComponents.id, id));
      await this.audit.record(tx, ctx, { entity: ENTITY, entityId: id, action: "update", before: { name: current.name, kind: current.kind }, after: input });
    });
  }

  async archive(user: AuthUser, id: string): Promise<SalaryComponentSettings> {
    const ctx = tenantContextOf(user);
    return this.mutate(ctx, async (tx) => {
      const current = await this.lockComponent(tx, id);
      if (current.kind === "base_salary") throw new BadRequestException("Gaji pokok tidak bisa diarsipkan");
      if (current.archivedAt) return;
      await tx.update(salaryComponents).set({ archivedAt: new Date() }).where(eq(salaryComponents.id, id));
      await this.audit.record(tx, ctx, { entity: ENTITY, entityId: id, action: "archive", before: { name: current.name } });
    });
  }

  async restore(user: AuthUser, id: string): Promise<SalaryComponentSettings> {
    const ctx = tenantContextOf(user);
    return this.mutate(ctx, async (tx) => {
      const current = await this.lockComponent(tx, id);
      if (!current.archivedAt) return;
      await tx.update(salaryComponents).set({ archivedAt: null }).where(eq(salaryComponents.id, id));
      await this.audit.record(tx, ctx, { entity: ENTITY, entityId: id, action: "restore", after: { name: current.name } });
    });
  }

  async remove(user: AuthUser, id: string): Promise<SalaryComponentSettings> {
    const ctx = tenantContextOf(user);
    return this.mutate(ctx, async (tx) => {
      const current = await this.lockComponent(tx, id);
      if (current.kind === "base_salary") throw new BadRequestException("Gaji pokok tidak bisa dihapus");
      if (await this.isInUse(tx, id)) throw new ConflictException("Komponen sudah dipakai di gaji karyawan — arsipkan saja");
      await tx.delete(salaryComponents).where(eq(salaryComponents.id, id));
      await this.audit.record(tx, ctx, { entity: ENTITY, entityId: id, action: "delete", before: { name: current.name, kind: current.kind } });
    });
  }

  async setJkkRiskLevel(user: AuthUser, input: JkkRiskLevelInput): Promise<SalaryComponentSettings> {
    const ctx = tenantContextOf(user);
    return this.mutate(ctx, async (tx) => {
      const [current] = await tx.select({ jkkRiskLevel: tenants.jkkRiskLevel }).from(tenants).where(eq(tenants.id, ctx.tenantId)).for("update");
      if (!current) throw new NotFoundException("Usaha tidak ditemukan");
      if (current.jkkRiskLevel === input.jkkRiskLevel) return;
      await tx.update(tenants).set({ jkkRiskLevel: input.jkkRiskLevel }).where(eq(tenants.id, ctx.tenantId));
      await this.audit.record(tx, ctx, {
        entity: "tenant",
        entityId: ctx.tenantId,
        action: "update_jkk_risk_level",
        before: { jkkRiskLevel: current.jkkRiskLevel },
        after: input,
      });
    });
  }

  // ——— helper ———

  // Jalankan perubahan (owner/admin) lalu kembalikan pengaturan terbaru; pelanggaran constraint katalog → 409
  private async mutate(ctx: TenantContext, change: (tx: Transaction) => Promise<void>): Promise<SalaryComponentSettings> {
    try {
      return await withTenant(this.db, ctx, async (tx) => {
        await requireSalaryManager(tx, ctx);
        await change(tx);
        return this.loadSettings(tx, ctx);
      });
    } catch (error) {
      const message = conflictMessage(error);
      if (message) throw new ConflictException(message);
      // Gaji karyawan baru saja memakai komponen ini (hapus bersamaan)
      if (foreignKeyViolationConstraint(error) === "employee_salary_items_component_fk") {
        throw new ConflictException("Komponen sudah dipakai di gaji karyawan — arsipkan saja");
      }
      throw error;
    }
  }

  // FOR UPDATE: bergantian dengan penyimpanan gaji yang membaca komponen FOR SHARE (jenis tidak berubah di tengah jalan)
  private async lockComponent(tx: Transaction, id: string): Promise<ComponentRow> {
    const [row] = await tx.select(componentColumns).from(salaryComponents).where(eq(salaryComponents.id, id)).for("update");
    if (!row) throw new NotFoundException("Komponen gaji tidak ditemukan");
    return row;
  }

  private async isInUse(tx: Transaction, id: string): Promise<boolean> {
    const [row] = await tx.select({ id: employeeSalaryItems.id }).from(employeeSalaryItems).where(eq(employeeSalaryItems.componentId, id)).limit(1);
    return row !== undefined;
  }

  private async loadSettings(tx: Transaction, ctx: TenantContext): Promise<SalaryComponentSettings> {
    const today = localClock(new Date(), await this.attendance.tenantTimeZone(tx, ctx.tenantId)).date;
    const [tenant] = await tx.select({ jkkRiskLevel: tenants.jkkRiskLevel }).from(tenants).where(eq(tenants.id, ctx.tenantId));
    if (!tenant) throw new NotFoundException("Usaha tidak ditemukan");

    const rows = await tx
      .select(componentColumns)
      .from(salaryComponents)
      .orderBy(sql`${salaryComponents.archivedAt} IS NOT NULL`, asc(salaryComponents.sortOrder), asc(salaryComponents.name));
    const usage = await tx
      .select({
        componentId: employeeSalaryItems.componentId,
        // Karyawan aktif hari ini yang versi gaji berjalannya memakai komponen ini
        employeeCount: countDistinct(
          sql`CASE WHEN ${employeeSalaries.effectiveFrom} <= ${today}
            AND (${employeeSalaries.effectiveTo} IS NULL OR ${employeeSalaries.effectiveTo} >= ${today})
            AND (${employees.endDate} IS NULL OR ${employees.endDate} >= ${today})
            THEN ${employeeSalaries.employeeId} END`,
        ),
      })
      .from(employeeSalaryItems)
      .innerJoin(employeeSalaries, eq(employeeSalaries.id, employeeSalaryItems.salaryId))
      .innerJoin(employees, eq(employees.id, employeeSalaries.employeeId))
      .groupBy(employeeSalaryItems.componentId);
    const usageById = new Map(usage.map((row) => [row.componentId, row.employeeCount]));

    return {
      jkkRiskLevel: toJkkRiskLevel(tenant.jkkRiskLevel),
      components: rows.map((row) => ({
        id: row.id,
        name: row.name,
        kind: row.kind,
        builtin: row.builtinKey !== null,
        archived: row.archivedAt !== null,
        inUse: usageById.has(row.id),
        employeeCount: usageById.get(row.id) ?? 0,
      })),
    };
  }
}

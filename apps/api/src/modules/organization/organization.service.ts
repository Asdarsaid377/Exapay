import { departments, positions } from "@exapay/db";
import type { OrgItem, OrgItemInput, OrgKind, Organization } from "@exapay/shared";
import { ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { asc, eq } from "drizzle-orm";

import { type AuthUser, tenantContextOf } from "../../common/auth/auth-user.js";
import { DRIZZLE } from "../../database/database.module.js";
import { isUniqueViolation } from "../../database/errors.js";
import { type Database, type Transaction, withTenant } from "../../database/tenant-transaction.js";
import { AuditService } from "../audit/audit.service.js";

// Kedua tabel berbentuk sama (id, tenant_id, name, timestamps) — satu implementasi untuk keduanya
const TABLES = { departments, positions } as const;
const ENTITY: Record<OrgKind, string> = { departments: "department", positions: "position" };
const LABEL: Record<OrgKind, string> = { departments: "Departemen", positions: "Jabatan" };

// Departemen & jabatan usaha aktif (feature 10). RLS tenant_isolation membatasi baris ke tenant aktif.
@Injectable()
export class OrganizationService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly audit: AuditService,
  ) {}

  async overview(user: AuthUser): Promise<Organization> {
    return withTenant(this.db, tenantContextOf(user), async (tx) => ({
      departments: await this.list(tx, "departments"),
      positions: await this.list(tx, "positions"),
      canManage: user.role === "owner" || user.role === "admin",
    }));
  }

  async create(user: AuthUser, kind: OrgKind, input: OrgItemInput): Promise<OrgItem> {
    const ctx = tenantContextOf(user);
    const table = TABLES[kind];
    return this.mapDuplicate(kind, () =>
      withTenant(this.db, ctx, async (tx) => {
        const [row] = await tx
          .insert(table)
          .values({ tenantId: ctx.tenantId, name: input.name })
          .returning({ id: table.id, name: table.name, createdAt: table.createdAt });
        if (!row) throw new Error("[organization/create] insert tidak mengembalikan baris");
        await this.audit.record(tx, ctx, { entity: ENTITY[kind], entityId: row.id, action: "create", after: { name: row.name } });
        return { ...row, createdAt: row.createdAt.toISOString() };
      }),
    );
  }

  async rename(user: AuthUser, kind: OrgKind, id: string, input: OrgItemInput): Promise<OrgItem> {
    const ctx = tenantContextOf(user);
    const table = TABLES[kind];
    return this.mapDuplicate(kind, () =>
      withTenant(this.db, ctx, async (tx) => {
        const [current] = await tx.select({ name: table.name }).from(table).where(eq(table.id, id)).for("update");
        if (!current) throw new NotFoundException(`${LABEL[kind]} tidak ditemukan`);

        const [row] = await tx
          .update(table)
          .set({ name: input.name })
          .where(eq(table.id, id))
          .returning({ id: table.id, name: table.name, createdAt: table.createdAt });
        if (!row) throw new NotFoundException(`${LABEL[kind]} tidak ditemukan`);
        if (current.name !== row.name) {
          await this.audit.record(tx, ctx, { entity: ENTITY[kind], entityId: id, action: "rename", before: { name: current.name }, after: { name: row.name } });
        }
        return { ...row, createdAt: row.createdAt.toISOString() };
      }),
    );
  }

  // TODO(feature 11): karyawan mereferensikan departemen/jabatan (FK restrict) — tolak hapus yang masih dipakai dengan pesan jelas
  async remove(user: AuthUser, kind: OrgKind, id: string): Promise<void> {
    const ctx = tenantContextOf(user);
    const table = TABLES[kind];
    await withTenant(this.db, ctx, async (tx) => {
      const [row] = await tx.delete(table).where(eq(table.id, id)).returning({ name: table.name });
      if (!row) throw new NotFoundException(`${LABEL[kind]} tidak ditemukan`);
      await this.audit.record(tx, ctx, { entity: ENTITY[kind], entityId: id, action: "delete", before: { name: row.name } });
    });
  }

  private async list(tx: Transaction, kind: OrgKind): Promise<OrgItem[]> {
    const table = TABLES[kind];
    const rows = await tx.select({ id: table.id, name: table.name, createdAt: table.createdAt }).from(table).orderBy(asc(table.name));
    return rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }));
  }

  // Nama unik per usaha (index lower(name)) — termasuk dua permintaan bersamaan
  private async mapDuplicate<T>(kind: OrgKind, fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (error: unknown) {
      if (isUniqueViolation(error)) throw new ConflictException(`${LABEL[kind]} dengan nama ini sudah ada`);
      throw error;
    }
  }
}

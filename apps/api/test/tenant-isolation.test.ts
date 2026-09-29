import { randomUUID } from "node:crypto";

import { auditLogs, memberships, tenants, users } from "@exapay/db";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";

import * as schema from "@exapay/db";
import { type Database, type TenantContext, withTenant } from "../src/database/tenant-transaction.js";
import { AuditService } from "../src/modules/audit/audit.service.js";

// Verifikasi feature 02: isolasi tenant lewat RLS, dijalankan sebagai app_user (role runtime API).

type Fixture = { tenantId: string; userId: string; ctx: TenantContext };

let pool: pg.Pool;
let db: Database;
let tenantA: Fixture;
let tenantB: Fixture;

// Drizzle membungkus error pg; cari pesan asli di rantai `cause`
function errorChainMessage(error: unknown): string {
  const messages: string[] = [];
  let current: unknown = error;
  while (current instanceof Error) {
    messages.push(current.message);
    current = current.cause;
  }
  return messages.join(" | ");
}

async function expectDbError(promise: Promise<unknown>, pattern: RegExp): Promise<void> {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error, "query seharusnya ditolak database").not.toBeNull();
  expect(errorChainMessage(error)).toMatch(pattern);
}

async function createTenantWithOwner(name: string): Promise<Fixture> {
  const tenantId = randomUUID();
  const userId = randomUUID();
  const ctx: TenantContext = { tenantId, userId };
  await withTenant(db, ctx, async (tx) => {
    await tx.insert(tenants).values({ id: tenantId, name });
    await tx.insert(users).values({ id: userId, email: `owner-${userId}@test.exapay.local`, fullName: `Owner ${name}` });
    await tx.insert(memberships).values({ tenantId, userId, role: "owner" });
  });
  return { tenantId, userId, ctx };
}

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: inject("testDatabaseUrl") });
  db = drizzle({ client: pool, schema });

  tenantA = await createTenantWithOwner("Toko A");
  tenantB = await createTenantWithOwner("Toko B");

  const audit = new AuditService();
  await withTenant(db, tenantA.ctx, (tx) =>
    audit.record(tx, tenantA.ctx, { entity: "tenant", entityId: tenantA.tenantId, action: "create", after: { name: "Toko A" } }),
  );
  await withTenant(db, tenantB.ctx, (tx) =>
    audit.record(tx, tenantB.ctx, { entity: "tenant", entityId: tenantB.tenantId, action: "create", after: { name: "Toko B" } }),
  );
});

afterAll(async () => {
  await pool.end();
});

describe("role runtime app_user", () => {
  it("bukan superuser dan tidak punya BYPASSRLS", async () => {
    const { rows } = await pool.query<{ rolname: string; rolsuper: boolean; rolbypassrls: boolean }>(
      "select rolname, rolsuper, rolbypassrls from pg_roles where rolname = current_user",
    );
    expect(rows).toEqual([{ rolname: "app_user", rolsuper: false, rolbypassrls: false }]);
  });

  it("bukan owner tabel manapun di schema public", async () => {
    const { rows } = await pool.query<{ tablename: string; tableowner: string }>(
      "select tablename, tableowner from pg_tables where schemaname = 'public'",
    );
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.tableowner, row.tablename).toBe("app_owner");
    }
  });

  it("semua tabel di schema public memakai RLS enabled + FORCE", async () => {
    const { rows } = await pool.query<{ relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean }>(
      `select c.relname, c.relrowsecurity, c.relforcerowsecurity
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r'`,
    );
    expect(rows.map((r) => r.relname).sort()).toEqual(["audit_logs", "memberships", "tenants", "users"]);
    for (const row of rows) {
      expect(row.relrowsecurity, `${row.relname} RLS enabled`).toBe(true);
      expect(row.relforcerowsecurity, `${row.relname} FORCE RLS`).toBe(true);
    }
  });
});

describe("isolasi baca antar tenant", () => {
  it("konteks tenant A hanya melihat data tenant A", async () => {
    const result = await withTenant(db, tenantA.ctx, async (tx) => ({
      tenants: await tx.select({ id: tenants.id }).from(tenants),
      memberships: await tx.select({ tenantId: memberships.tenantId }).from(memberships),
      users: await tx.select({ id: users.id }).from(users),
      audit: await tx.select({ tenantId: auditLogs.tenantId }).from(auditLogs),
    }));

    expect(result.tenants).toEqual([{ id: tenantA.tenantId }]);
    expect(result.memberships).toEqual([{ tenantId: tenantA.tenantId }]);
    expect(result.users).toEqual([{ id: tenantA.userId }]);
    expect(result.audit).toEqual([{ tenantId: tenantA.tenantId }]);
  });

  it("konteks tenant A tidak bisa membaca baris tenant B walau di-filter eksplisit", async () => {
    const rows = await withTenant(db, tenantA.ctx, (tx) =>
      tx.select({ id: tenants.id }).from(tenants).where(eq(tenants.id, tenantB.tenantId)),
    );
    expect(rows).toEqual([]);
  });

  it("konteks tenant B hanya melihat data tenant B", async () => {
    const rows = await withTenant(db, tenantB.ctx, (tx) => tx.select({ tenantId: memberships.tenantId }).from(memberships));
    expect(rows).toEqual([{ tenantId: tenantB.tenantId }]);
  });
});

describe("isolasi tulis antar tenant", () => {
  it("insert membership untuk tenant B dari konteks A ditolak", async () => {
    await expectDbError(
      withTenant(db, tenantA.ctx, (tx) =>
        tx.insert(memberships).values({ tenantId: tenantB.tenantId, userId: tenantA.userId, role: "admin" }),
      ),
      /row-level security/,
    );
  });

  it("insert audit log untuk tenant B dari konteks A ditolak", async () => {
    await expectDbError(
      withTenant(db, tenantA.ctx, (tx) =>
        tx.insert(auditLogs).values({ tenantId: tenantB.tenantId, entity: "x", entityId: "1", action: "spoof" }),
      ),
      /row-level security/,
    );
  });

  it("update/delete baris tenant B dari konteks A tidak mengenai baris apapun", async () => {
    const result = await withTenant(db, tenantA.ctx, async (tx) => ({
      updated: await tx
        .update(tenants)
        .set({ name: "Diretas" })
        .where(eq(tenants.id, tenantB.tenantId))
        .returning({ id: tenants.id }),
      deleted: await tx
        .delete(memberships)
        .where(eq(memberships.tenantId, tenantB.tenantId))
        .returning({ id: memberships.id }),
    }));
    expect(result).toEqual({ updated: [], deleted: [] });

    const tenantBRows = await withTenant(db, tenantB.ctx, async (tx) => ({
      tenants: await tx.select({ name: tenants.name }).from(tenants),
      memberships: await tx.select({ userId: memberships.userId }).from(memberships),
    }));
    expect(tenantBRows).toEqual({ tenants: [{ name: "Toko B" }], memberships: [{ userId: tenantB.userId }] });
  });

  it("memindahkan membership ke tenant B lewat update ditolak", async () => {
    await expectDbError(
      withTenant(db, tenantA.ctx, (tx) =>
        tx.update(memberships).set({ tenantId: tenantB.tenantId }).where(eq(memberships.tenantId, tenantA.tenantId)),
      ),
      /row-level security/,
    );
  });

  it("membuat user atas nama orang lain (id ≠ user di konteks) ditolak", async () => {
    const otherId = randomUUID();
    await expectDbError(
      withTenant(db, tenantA.ctx, (tx) =>
        tx.insert(users).values({ id: otherId, email: `other-${otherId}@test.exapay.local`, fullName: "Orang Lain" }),
      ),
      /row-level security/,
    );
  });
});

describe("tanpa konteks tenant", () => {
  it("query tanpa konteks tidak mengembalikan baris", async () => {
    const counts = await Promise.all(
      ["tenants", "users", "memberships", "audit_logs"].map(async (table) => {
        const { rows } = await pool.query<{ count: string }>(`select count(*) as count from ${table}`);
        return rows[0]?.count;
      }),
    );
    expect(counts).toEqual(["0", "0", "0", "0"]);
  });

  it("koneksi pool bekas transaksi ber-tenant tidak membawa konteks lama", async () => {
    // Pool 1 koneksi memaksa koneksi yang sama dipakai ulang
    const singlePool = new pg.Pool({ connectionString: inject("testDatabaseUrl"), max: 1 });
    const singleDb = drizzle({ client: singlePool, schema });
    try {
      const inside = await withTenant(singleDb, tenantA.ctx, (tx) => tx.select({ id: tenants.id }).from(tenants));
      expect(inside).toEqual([{ id: tenantA.tenantId }]);

      const after = await singleDb.select({ id: tenants.id }).from(tenants);
      expect(after).toEqual([]);

      const setting = await singlePool.query<{ tenant: string | null }>("select current_app_tenant_id() as tenant");
      expect(setting.rows[0]?.tenant).toBeNull();
    } finally {
      await singlePool.end();
    }
  });

  it("insert tanpa konteks ditolak", async () => {
    await expectDbError(db.insert(tenants).values({ name: "Tanpa Konteks" }), /row-level security/);
  });
});

describe("audit log", () => {
  it("mencatat tenant & aktor dari konteks", async () => {
    const rows = await withTenant(db, tenantA.ctx, (tx) =>
      tx
        .select({ tenantId: auditLogs.tenantId, actorUserId: auditLogs.actorUserId, action: auditLogs.action, after: auditLogs.after })
        .from(auditLogs),
    );
    expect(rows).toEqual([
      { tenantId: tenantA.tenantId, actorUserId: tenantA.userId, action: "create", after: { name: "Toko A" } },
    ]);
  });

  it("ikut di-rollback jika transaksi mutasinya gagal", async () => {
    const audit = new AuditService();
    await expectDbError(
      withTenant(db, tenantA.ctx, async (tx) => {
        await audit.record(tx, tenantA.ctx, { entity: "tenant", entityId: tenantA.tenantId, action: "rollback-test" });
        await tx.execute(sql`select 1 / 0`);
      }),
      /division by zero/,
    );
    const rows = await withTenant(db, tenantA.ctx, (tx) =>
      tx.select({ id: auditLogs.id }).from(auditLogs).where(eq(auditLogs.action, "rollback-test")),
    );
    expect(rows).toEqual([]);
  });

  it("append-only: app_user tidak bisa update/delete", async () => {
    await expectDbError(
      withTenant(db, tenantA.ctx, (tx) => tx.update(auditLogs).set({ action: "diubah" })),
      /permission denied/,
    );
    await expectDbError(
      withTenant(db, tenantA.ctx, (tx) => tx.delete(auditLogs)),
      /permission denied/,
    );
  });
});

describe("trigger updated_at", () => {
  it("memperbarui updated_at saat baris di-update", async () => {
    await withTenant(db, tenantA.ctx, (tx) => tx.update(tenants).set({ name: "Toko A Baru" }).where(eq(tenants.id, tenantA.tenantId)));
    const [row] = await withTenant(db, tenantA.ctx, (tx) =>
      tx.select({ createdAt: tenants.createdAt, updatedAt: tenants.updatedAt }).from(tenants),
    );
    if (!row) throw new Error("tenant A tidak ditemukan");
    expect(row.updatedAt.getTime()).toBeGreaterThan(row.createdAt.getTime());
  });
});

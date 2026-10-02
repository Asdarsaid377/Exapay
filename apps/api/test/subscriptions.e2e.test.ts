import "reflect-metadata";
import { randomUUID } from "node:crypto";

import * as schema from "@exapay/db";
import { auditLogs, memberships, tenants, tenantSubscriptions, users } from "@exapay/db";
import type { MembershipRole, SubscriptionStatus } from "@exapay/shared";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { hash } from "@node-rs/argon2";
import { and, eq, sql } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, inject, it, vi } from "vitest";

import { AppModule } from "../src/app.module.js";
import { configureApp } from "../src/app.setup.js";
import { type Database, withTenant, withUser } from "../src/database/tenant-transaction.js";

// Verifikasi feature 39: trial otomatis saat signup, status efektif dari tanggal, mode baca-saja (402), gratis/pilot,
// pilihan super-admin, dan pengaman database (trigger guard_tenant_subscription).

const PASSWORD = "password-langganan-123";
const DAY = 24 * 60 * 60 * 1000;
const READ_ONLY_CODE = "SUBSCRIPTION_READ_ONLY";

let app: INestApplication;
let server: Parameters<typeof request>[0];
let pool: pg.Pool;
let ownerPool: pg.Pool;
let db: Database;
let ownerDb: NodePgDatabase;

type Workspace = { tenantId: string; emails: Record<MembershipRole, string> };

async function createWorkspace(name: string): Promise<Workspace> {
  const tenantId = randomUUID();
  const passwordHash = await hash(PASSWORD);
  const emails: Record<MembershipRole, string> = { owner: "", admin: "", atasan: "", karyawan: "" };
  for (const role of ["owner", "admin", "atasan", "karyawan"] as const) {
    const id = randomUUID();
    emails[role] = `${role}-${randomUUID().slice(0, 8)}@test.exapay.local`;
    await withUser(db, id, (tx) => tx.insert(users).values({ id, email: emails[role], fullName: `${role} ${name}`, passwordHash, emailVerifiedAt: new Date() }));
    await withTenant(db, { tenantId, userId: id }, async (tx) => {
      if (role === "owner") await tx.insert(tenants).values({ id: tenantId, name });
      await tx.insert(memberships).values({ tenantId, userId: id, role });
    });
  }
  return { tenantId, emails };
}

// Langganan dengan tanggal bebas: hanya app_owner (lolos trigger) — FORCE RLS tetap butuh konteks tenant
async function setSubscription(
  tenantId: string,
  status: SubscriptionStatus,
  dates: { trialEndsAt?: Date; currentPeriodEndsAt?: Date } = {},
): Promise<void> {
  await ownerDb.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.tenant_id', ${tenantId}, true)`);
    const values = { status, trialEndsAt: dates.trialEndsAt ?? null, currentPeriodEndsAt: dates.currentPeriodEndsAt ?? null };
    await tx.insert(tenantSubscriptions).values({ tenantId, ...values }).onConflictDoUpdate({ target: tenantSubscriptions.tenantId, set: values });
  });
}

async function subscriptionOf(tenantId: string): Promise<typeof tenantSubscriptions.$inferSelect | undefined> {
  return ownerDb.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.tenant_id', ${tenantId}, true)`);
    const [row] = await tx.select().from(tenantSubscriptions).where(eq(tenantSubscriptions.tenantId, tenantId));
    return row;
  });
}

async function tokenOf(email: string): Promise<string> {
  const res = await request(server).post("/auth/login").send({ email, password: PASSWORD, client: "mobile" });
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return String(res.body.data.tokens.accessToken);
}

function createDepartment(token: string, name: string): request.Test {
  return request(server).post("/organization/departments").set("Authorization", `Bearer ${token}`).send({ name });
}

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: inject("testDatabaseUrl") });
  ownerPool = new pg.Pool({ connectionString: inject("testOwnerDatabaseUrl") });
  db = drizzle({ client: pool, schema });
  ownerDb = drizzle({ client: ownerPool });
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();
  server = app.getHttpServer();
});

afterEach(() => {
  vi.useRealTimers();
});

afterAll(async () => {
  await app?.close();
  await pool?.end();
  await ownerPool?.end();
});

describe("trial saat signup", () => {
  it("signup mandiri → trialing 30 hari (dari harga berlaku) + audit subscription/start", async () => {
    const companyName = `Toko Trial ${randomUUID().slice(0, 8)}`;
    const before = Date.now();
    const res = await request(server)
      .post("/auth/signup")
      .send({ fullName: "Pemilik Trial", companyName, email: `trial-${randomUUID().slice(0, 8)}@test.exapay.local`, password: PASSWORD });
    expect(res.status, JSON.stringify(res.body)).toBe(200);

    const tenant = (await ownerDb.select({ id: tenants.id }).from(tenants).where(eq(tenants.name, companyName)))[0];
    expect(tenant).toBeDefined();
    const row = await subscriptionOf(String(tenant?.id));
    expect(row?.status).toBe("trialing");
    const trialMs = Number(row?.trialEndsAt?.getTime()) - before;
    expect(trialMs).toBeGreaterThanOrEqual(30 * DAY - 60_000);
    expect(trialMs).toBeLessThanOrEqual(30 * DAY + 60_000);

    const audit = await ownerDb.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.tenant_id', ${String(tenant?.id)}, true)`);
      return tx
        .select({ action: auditLogs.action })
        .from(auditLogs)
        .where(and(eq(auditLogs.tenantId, String(tenant?.id)), eq(auditLogs.entity, "subscription")));
    });
    expect(audit).toEqual([{ action: "start" }]);
  });
});

describe("mode baca-saja", () => {
  it("setelah trial + tenggang lewat: mutasi ditolak 402 (pesan sesuai peran); baca & auth tetap jalan", async () => {
    const ws = await createWorkspace("Toko Terkunci");
    await setSubscription(ws.tenantId, "trialing", { trialEndsAt: new Date(Date.now() - 8 * DAY) });
    const owner = await tokenOf(ws.emails.owner);
    const karyawan = await tokenOf(ws.emails.karyawan);

    const blocked = await createDepartment(owner, "Produksi");
    expect(blocked.status).toBe(402);
    expect(blocked.body.code).toBe(READ_ONLY_CODE);
    expect(blocked.body.error).toContain("Data masih bisa dilihat dan diekspor");

    const clockIn = await request(server).post("/attendance/me/check-in").set("Authorization", `Bearer ${karyawan}`).send({});
    expect(clockIn.status).toBe(402);
    expect(clockIn.body.error).toContain("Hubungi pemilik usaha Anda");

    // Baca tetap boleh
    expect((await request(server).get("/organization").set("Authorization", `Bearer ${owner}`)).status).toBe(200);
    expect((await request(server).get("/employees").set("Authorization", `Bearer ${owner}`)).status).toBe(200);
    // Auth tetap boleh: password lama salah → 400 dari service, bukan 402 dari guard
    const changePassword = await request(server)
      .post("/auth/change-password")
      .set("Authorization", `Bearer ${owner}`)
      .send({ currentPassword: "bukan-password-ini", newPassword: "password-baru-yang-kuat-1" });
    expect(changePassword.status).toBe(400);
    // Aksi pengecualian (pratinjau impor) tidak diblokir guard
    const preview = await request(server).post("/employees/import/preview").set("Authorization", `Bearer ${owner}`);
    expect(preview.status).not.toBe(402);
  });

  it("dalam masa tenggang (past_due) usaha tetap bisa dipakai", async () => {
    const ws = await createWorkspace("Toko Tenggang");
    await setSubscription(ws.tenantId, "trialing", { trialEndsAt: new Date(Date.now() - 3 * DAY) });
    expect((await createDepartment(await tokenOf(ws.emails.owner), "Gudang")).status).toBe(201);
  });

  it("transisi dihitung dari tanggal: trial berjalan → terkunci setelah 30 + 7 hari tanpa cron", async () => {
    const ws = await createWorkspace("Toko Waktu");
    await setSubscription(ws.tenantId, "trialing", { trialEndsAt: new Date(Date.now() + 30 * DAY) });
    expect((await createDepartment(await tokenOf(ws.emails.owner), "Hari Ini")).status).toBe(201);

    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(Date.now() + 36 * DAY));
    expect((await createDepartment(await tokenOf(ws.emails.owner), "Masih Tenggang")).status).toBe(201);

    vi.setSystemTime(new Date(Date.now() + 2 * DAY));
    const locked = await createDepartment(await tokenOf(ws.emails.owner), "Terkunci");
    expect(locked.status).toBe(402);
    expect(locked.body.code).toBe(READ_ONLY_CODE);
  });

  it("langganan aktif memakai akhir periode berbayar; gratis (pilot) tidak pernah terkunci", async () => {
    const active = await createWorkspace("Toko Aktif");
    await setSubscription(active.tenantId, "active", { trialEndsAt: new Date(Date.now() - 90 * DAY), currentPeriodEndsAt: new Date(Date.now() + 5 * DAY) });
    expect((await createDepartment(await tokenOf(active.emails.owner), "Aktif")).status).toBe(201);

    const pilot = await createWorkspace("Toko Pilot");
    await setSubscription(pilot.tenantId, "complimentary");
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(Date.now() + 3650 * DAY));
    expect((await createDepartment(await tokenOf(pilot.emails.owner), "Sepuluh Tahun Lagi")).status).toBe(201);
  });
});

describe("tenant buatan super-admin", () => {
  it("super-admin memilih trial (bawaan) atau gratis/pilot", async () => {
    const id = randomUUID();
    const email = `sa-${id.slice(0, 8)}@test.exapay.local`;
    await withUser(db, id, async (tx) => tx.insert(users).values({ id, email, fullName: "Super Admin", passwordHash: await hash(PASSWORD), emailVerifiedAt: new Date() }));
    await ownerDb.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.user_id', ${id}, true)`);
      await tx.update(users).set({ isSuperAdmin: true }).where(eq(users.id, id));
    });
    const token = await tokenOf(email);
    const create = (body: Record<string, string>): request.Test =>
      request(server)
        .post("/admin/tenants")
        .set("Authorization", `Bearer ${token}`)
        .send({ name: `Usaha ${randomUUID().slice(0, 6)}`, ownerFullName: "Pemilik", ownerEmail: `pemilik-${randomUUID().slice(0, 8)}@test.exapay.local`, ...body });

    const pilot = await create({ subscription: "complimentary" });
    expect(pilot.status, JSON.stringify(pilot.body)).toBe(201);
    expect((await subscriptionOf(String(pilot.body.data.id)))?.status).toBe("complimentary");

    const trial = await create({});
    expect(trial.status).toBe(201);
    const trialRow = await subscriptionOf(String(trial.body.data.id));
    expect(trialRow?.status).toBe("trialing");
    expect(Number(trialRow?.trialEndsAt?.getTime()) - Date.now()).toBeGreaterThan(29 * DAY);

    expect((await create({ subscription: "selamanya" })).status).toBe(400);
  });
});

describe("pengaman database", () => {
  it("anggota tenant biasa hanya bisa membuat trial standar; tidak bisa mengubah langganan", async () => {
    const userId = randomUUID();
    await withUser(db, userId, async (tx) =>
      tx.insert(users).values({ id: userId, email: `guard-${userId.slice(0, 8)}@test.exapay.local`, fullName: "Penjaga", passwordHash: "x" }),
    );
    const newTenant = async (): Promise<string> => {
      const tenantId = randomUUID();
      await withTenant(db, { tenantId, userId }, (tx) => tx.insert(tenants).values({ id: tenantId, name: "Uji Trigger" }));
      return tenantId;
    };
    const insert = async (tenantId: string, values: Omit<typeof tenantSubscriptions.$inferInsert, "tenantId">): Promise<void> => {
      await withTenant(db, { tenantId, userId }, (tx) => tx.insert(tenantSubscriptions).values({ tenantId, ...values }));
    };

    const pilot = await newTenant();
    await expect(insert(pilot, { status: "complimentary" })).rejects.toThrow();
    const longTrial = await newTenant();
    await expect(insert(longTrial, { status: "trialing", trialEndsAt: new Date(Date.now() + 60 * DAY) })).rejects.toThrow();
    const paid = await newTenant();
    await expect(insert(paid, { status: "active", currentPeriodEndsAt: new Date(Date.now() + 30 * DAY) })).rejects.toThrow();

    const standard = await newTenant();
    await insert(standard, { status: "trialing", trialEndsAt: new Date(Date.now() + 30 * DAY) });
    // app_user tanpa hak UPDATE (feature 41/42 yang menambahkannya, dijaga trigger)
    await expect(
      withTenant(db, { tenantId: standard, userId }, (tx) =>
        tx.update(tenantSubscriptions).set({ status: "complimentary" }).where(eq(tenantSubscriptions.tenantId, standard)),
      ),
    ).rejects.toThrow();
    expect((await subscriptionOf(standard))?.status).toBe("trialing");
  });

  it("isolasi: konteks tenant A tidak melihat langganan tenant B", async () => {
    const a = await createWorkspace("Isolasi A");
    const b = await createWorkspace("Isolasi B");
    await setSubscription(a.tenantId, "complimentary");
    await setSubscription(b.tenantId, "complimentary");
    const rows = await withTenant(db, { tenantId: a.tenantId, userId: null }, (tx) => tx.select({ tenantId: tenantSubscriptions.tenantId }).from(tenantSubscriptions));
    expect(rows).toEqual([{ tenantId: a.tenantId }]);
  });
});

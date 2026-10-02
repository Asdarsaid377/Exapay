import "reflect-metadata";
import { randomUUID } from "node:crypto";

import * as schema from "@exapay/db";
import { departments, employees, memberships, positions, tenants, tenantSubscriptions, users } from "@exapay/db";
import { type MembershipRole, type SubscriptionStatus } from "@exapay/shared";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { hash } from "@node-rs/argon2";
import { sql } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";

import { AppModule } from "../src/app.module.js";
import { configureApp } from "../src/app.setup.js";
import { type Database, withTenant, withUser } from "../src/database/tenant-transaction.js";

// Verifikasi feature 40: GET /billing (owner) — estimasi = karyawan aktif /employees × harga berlaku (min. ditagih);
// GET /billing/status (owner/admin) — tahap banner pada hari yang tepat. Email pengingat: apps/worker/test/billing-notice.test.ts.

const PASSWORD = "password-billing-123";
const DAY = 24 * 60 * 60 * 1000;

let app: INestApplication;
let server: Parameters<typeof request>[0];
let pool: pg.Pool;
let ownerPool: pg.Pool;
let db: Database;
let ownerDb: NodePgDatabase;

type Workspace = { tenantId: string; emails: Record<MembershipRole, string>; tokens: Record<MembershipRole, string> };

async function tokenOf(email: string): Promise<string> {
  const res = await request(server).post("/auth/login").send({ email, password: PASSWORD, client: "mobile" });
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return String(res.body.data.tokens.accessToken);
}

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
  const tokens: Record<MembershipRole, string> = { owner: "", admin: "", atasan: "", karyawan: "" };
  for (const role of ["owner", "admin", "atasan", "karyawan"] as const) tokens[role] = await tokenOf(emails[role]);
  return { tenantId, emails, tokens };
}

// Langganan dengan tanggal bebas: hanya app_owner (lolos trigger) — FORCE RLS tetap butuh konteks tenant
async function setSubscription(tenantId: string, status: SubscriptionStatus, dates: { trialEndsAt?: Date; currentPeriodEndsAt?: Date } = {}): Promise<void> {
  await ownerDb.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.tenant_id', ${tenantId}, true)`);
    const values = { status, trialEndsAt: dates.trialEndsAt ?? null, currentPeriodEndsAt: dates.currentPeriodEndsAt ?? null };
    await tx.insert(tenantSubscriptions).values({ tenantId, ...values }).onConflictDoUpdate({ target: tenantSubscriptions.tenantId, set: values });
  });
}

async function addEmployees(tenantId: string, active: number, inactive: number): Promise<void> {
  await withTenant(db, { tenantId, userId: null }, async (tx) => {
    const [department] = await tx.insert(departments).values({ tenantId, name: `Operasional ${randomUUID().slice(0, 4)}` }).returning({ id: departments.id });
    const [position] = await tx.insert(positions).values({ tenantId, name: `Staf ${randomUUID().slice(0, 4)}` }).returning({ id: positions.id });
    if (!department || !position) throw new Error("gagal membuat departemen/jabatan");
    const base = { tenantId, departmentId: department.id, positionId: position.id, joinDate: "2025-01-01", ptkpStatus: "TK/0" as const, employmentStatus: "permanent" as const };
    const rows = [
      ...Array.from({ length: active }, (_, index) => ({ ...base, fullName: `Aktif ${index + 1}` })),
      ...Array.from({ length: inactive }, (_, index) => ({ ...base, fullName: `Keluar ${index + 1}`, endDate: "2026-09-30" })),
    ];
    if (rows.length > 0) await tx.insert(employees).values(rows);
  });
}

function getAs(token: string, path: string): request.Test {
  return request(server).get(path).set("Authorization", `Bearer ${token}`);
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

afterAll(async () => {
  await app?.close();
  await pool?.end();
  await ownerPool?.end();
});

describe("GET /billing — estimasi tagihan", () => {
  it("karyawan aktif = hitungan Aktif di /employees; di bawah minimum ditagih minimum", async () => {
    const ws = await createWorkspace("Toko Estimasi Kecil");
    await setSubscription(ws.tenantId, "trialing", { trialEndsAt: new Date(Date.now() + 20 * DAY) });
    await addEmployees(ws.tenantId, 3, 2);

    const list = await getAs(ws.tokens.owner, "/employees");
    expect(list.status).toBe(200);
    const res = await getAs(ws.tokens.owner, "/billing");
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const { estimate, subscription } = res.body.data;
    expect(estimate.activeEmployees).toBe(list.body.data.counts.active);
    expect(estimate).toMatchObject({ activeEmployees: 3, minBilledEmployees: 5, billedEmployees: 5, pricePerEmployee: "10000.00", amount: "50000.00" });
    expect(subscription).toMatchObject({ status: "trialing", baseStatus: "trialing", daysLeft: 20, notice: null });
  });

  it("di atas minimum: karyawan aktif × harga berlaku (karyawan keluar tidak dihitung)", async () => {
    const ws = await createWorkspace("Toko Estimasi Besar");
    await setSubscription(ws.tenantId, "trialing", { trialEndsAt: new Date(Date.now() + 10 * DAY) });
    await addEmployees(ws.tenantId, 12, 4);

    const list = await getAs(ws.tokens.owner, "/employees");
    const res = await getAs(ws.tokens.owner, "/billing");
    expect(res.body.data.estimate.activeEmployees).toBe(list.body.data.counts.active);
    expect(res.body.data.estimate).toMatchObject({ activeEmployees: 12, billedEmployees: 12, amount: "120000.00" });
  });

  it("khusus owner; status banner untuk owner & admin; atasan/karyawan ditolak", async () => {
    const ws = await createWorkspace("Toko Peran Billing");
    await setSubscription(ws.tenantId, "trialing", { trialEndsAt: new Date(Date.now() + 15 * DAY) });

    expect((await getAs(ws.tokens.admin, "/billing")).status).toBe(403);
    expect((await getAs(ws.tokens.atasan, "/billing")).status).toBe(403);
    expect((await getAs(ws.tokens.owner, "/billing/status")).status).toBe(200);
    expect((await getAs(ws.tokens.admin, "/billing/status")).status).toBe(200);
    expect((await getAs(ws.tokens.atasan, "/billing/status")).status).toBe(403);
    expect((await getAs(ws.tokens.karyawan, "/billing/status")).status).toBe(403);
  });
});

describe("GET /billing/status — tahap banner menurut tanggal", () => {
  it("trial H-8 tanpa banner → H-7, H-3, H-1, hari terakhir; tenggang; baca-saja (tetap bisa dibaca)", async () => {
    const ws = await createWorkspace("Toko Banner");
    const cases: [number, string | null, number][] = [
      [8, null, 8],
      [7, "trial_h7", 7],
      [4, "trial_h7", 4],
      [3, "trial_h3", 3],
      [2, "trial_h3", 2],
      [1, "trial_h1", 1],
    ];
    for (const [days, notice, daysLeft] of cases) {
      await setSubscription(ws.tenantId, "trialing", { trialEndsAt: new Date(Date.now() + days * DAY) });
      const res = await getAs(ws.tokens.owner, "/billing/status");
      expect(res.body.data, `H-${days}`).toMatchObject({ status: "trialing", notice, daysLeft });
    }

    // Trial berakhir 2 hari lalu: tenggang 7 hari → sisa 5 hari kalender sampai baca-saja
    await setSubscription(ws.tenantId, "trialing", { trialEndsAt: new Date(Date.now() - 2 * DAY) });
    const grace = await getAs(ws.tokens.admin, "/billing/status");
    expect(grace.body.data).toMatchObject({ status: "past_due", baseStatus: "trialing", notice: "grace_started", daysLeft: 5 });

    await setSubscription(ws.tenantId, "trialing", { trialEndsAt: new Date(Date.now() - 8 * DAY) });
    const locked = await getAs(ws.tokens.owner, "/billing");
    expect(locked.status).toBe(200);
    expect(locked.body.data.subscription).toMatchObject({ status: "read_only", notice: "read_only", daysLeft: null });
  });

  it("langganan aktif & gratis (pilot) tanpa banner", async () => {
    const ws = await createWorkspace("Toko Tanpa Banner");
    await setSubscription(ws.tenantId, "active", { currentPeriodEndsAt: new Date(Date.now() + 2 * DAY) });
    expect((await getAs(ws.tokens.owner, "/billing/status")).body.data).toMatchObject({ status: "active", notice: null, daysLeft: 2 });
    await setSubscription(ws.tenantId, "complimentary");
    expect((await getAs(ws.tokens.owner, "/billing/status")).body.data).toMatchObject({ status: "complimentary", notice: null, endsAt: null });
  });
});

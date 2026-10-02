import "reflect-metadata";
import { randomUUID } from "node:crypto";

import * as schema from "@exapay/db";
import { auditLogs, billingInvoices, departments, employees, memberships, positions, tenants, tenantSubscriptions, users } from "@exapay/db";
import { type MembershipRole, type SubscriptionStatus } from "@exapay/shared";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { hash } from "@node-rs/argon2";
import { and, eq, sql } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";

import { AppModule } from "../src/app.module.js";
import { configureApp } from "../src/app.setup.js";
import { type Database, withTenant, withUser } from "../src/database/tenant-transaction.js";

// Verifikasi feature 40: GET /billing (owner) — estimasi = karyawan aktif /employees × harga berlaku (min. ditagih);
// GET /billing/status (owner/admin) — tahap banner pada hari yang tepat. Email pengingat: apps/worker/test/billing-notice.test.ts.
// Feature 41: tagihan di /billing, QRIS (PNG) bernominal, "Saya sudah bayar" (+ bukti) → menunggu konfirmasi, juga saat
// baca-saja. Penerbitan tagihan (worker): apps/worker/test/billing-invoices.test.ts — di sini tagihan dibuat langsung.

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

// PNG 1×1 minimal (cukup untuk pemeriksaan magic bytes)
const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082", "hex");
// Kode unik berurutan per file test agar nominal tagihan berjalan tidak bentrok (index unik lintas tenant)
let nextCode = 100;

// Tagihan open seperti yang diterbitkan worker (app_user boleh INSERT status open). Tanggal lampau → app_owner.

// Seperti langkah pertama worker: tagihan open yang lewat batas bayar → expired (membebaskan slot tagihan berjalan)
async function expireOverdue(tenantId: string): Promise<void> {
  await withTenant(db, { tenantId, userId: null }, (tx) =>
    tx.update(billingInvoices).set({ status: "expired" }).where(and(eq(billingInvoices.status, "open"), sql`${billingInvoices.dueAt} < now()`)),
  );
}
async function insertInvoice(tenantId: string, dates: { issuedAt?: Date; dueAt?: Date } = {}): Promise<{ id: string; totalAmount: string }> {
  const uniqueCode = nextCode++;
  const values = {
    tenantId,
    number: `EXA-TEST-${randomUUID().slice(0, 8).toUpperCase()}`,
    periodStart: "2026-10-10",
    issuedAt: dates.issuedAt ?? new Date(),
    dueAt: dates.dueAt ?? new Date(Date.now() + 14 * DAY),
    pricePerEmployee: "10000",
    minBilledEmployees: 5,
    activeEmployees: 3,
    billedEmployees: 5,
    baseAmount: "50000",
    uniqueCode,
    totalAmount: String(50000 + uniqueCode),
  };
  if (dates.issuedAt) {
    return ownerDb.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.tenant_id', ${tenantId}, true)`);
      const [row] = await tx.insert(billingInvoices).values(values).returning({ id: billingInvoices.id, totalAmount: billingInvoices.totalAmount });
      if (!row) throw new Error("gagal membuat tagihan");
      return row;
    });
  }
  const [row] = await withTenant(db, { tenantId, userId: null }, (tx) =>
    tx.insert(billingInvoices).values(values).returning({ id: billingInvoices.id, totalAmount: billingInvoices.totalAmount }),
  );
  if (!row) throw new Error("gagal membuat tagihan");
  return row;
}

function claimAs(token: string, invoiceId: string, proof?: { buffer: Buffer; filename: string; contentType: string }): request.Test {
  const req = request(server).post(`/billing/invoices/${invoiceId}/claim`).set("Authorization", `Bearer ${token}`);
  return proof ? req.attach("proof", proof.buffer, { filename: proof.filename, contentType: proof.contentType }) : req.field("note", "");
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

describe("tagihan & pembayaran QRIS (feature 41)", () => {
  it("GET /billing: tagihan berjalan + riwayat; tagihan lewat batas tampil expired; QRIS tersedia", async () => {
    const ws = await createWorkspace("Toko Riwayat Tagihan");
    await setSubscription(ws.tenantId, "trialing", { trialEndsAt: new Date(Date.now() + 5 * DAY) });
    const empty = await getAs(ws.tokens.owner, "/billing");
    expect(empty.body.data).toMatchObject({ invoice: null, invoices: [], qrisAvailable: true });

    // Lewat batas bayar tapi belum ditandai worker → tampil expired, bukan tagihan berjalan
    await insertInvoice(ws.tenantId, { issuedAt: new Date(Date.now() - 20 * DAY), dueAt: new Date(Date.now() - 6 * DAY) });
    const overdue = await getAs(ws.tokens.owner, "/billing");
    expect(overdue.body.data).toMatchObject({ invoice: null, invoices: [{ status: "expired" }] });

    await expireOverdue(ws.tenantId);
    const current = await insertInvoice(ws.tenantId);
    const res = await getAs(ws.tokens.owner, "/billing");
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data.invoice).toMatchObject({ id: current.id, status: "open", totalAmount: current.totalAmount, baseAmount: "50000.00", billedEmployees: 5, proof: null });
    expect(res.body.data.invoices.map((invoice: { status: string }) => invoice.status)).toEqual(["open", "expired"]);
  });

  it("QRIS PNG khusus owner untuk tagihan yang masih bisa dibayar; tagihan usaha lain 404", async () => {
    const ws = await createWorkspace("Toko QRIS");
    const other = await createWorkspace("Toko QRIS Lain");
    await setSubscription(ws.tenantId, "trialing", { trialEndsAt: new Date(Date.now() + 5 * DAY) });
    const invoice = await insertInvoice(ws.tenantId);
    const otherInvoice = await insertInvoice(other.tenantId);

    const qr = await getAs(ws.tokens.owner, `/billing/invoices/${invoice.id}/qris`).buffer(true);
    expect(qr.status).toBe(200);
    expect(qr.headers["content-type"]).toBe("image/png");
    expect(Buffer.from(qr.body).subarray(1, 4).toString()).toBe("PNG");
    expect(qr.headers["content-disposition"]).toMatch(/QRIS-EXA-TEST-/);

    expect((await getAs(ws.tokens.admin, `/billing/invoices/${invoice.id}/qris`)).status).toBe(403);
    expect((await getAs(ws.tokens.owner, `/billing/invoices/${otherInvoice.id}/qris`)).status).toBe(404);
    expect((await getAs(ws.tokens.owner, "/billing/invoices/bukan-uuid/qris")).status).toBe(404);
  });

  it("Saya sudah bayar + bukti → menunggu konfirmasi, audit, QR ditutup; tidak bisa dilaporkan dua kali", async () => {
    const ws = await createWorkspace("Toko Lapor");
    await setSubscription(ws.tenantId, "trialing", { trialEndsAt: new Date(Date.now() + 5 * DAY) });
    const invoice = await insertInvoice(ws.tenantId);

    expect((await claimAs(ws.tokens.admin, invoice.id)).status).toBe(403);
    // Bukti bukan PDF/JPG/PNG ditolak; tagihan tetap open
    const bad = await claimAs(ws.tokens.owner, invoice.id, { buffer: Buffer.from("halo"), filename: "bukti.txt", contentType: "text/plain" });
    expect(bad.status).toBe(400);

    const res = await claimAs(ws.tokens.owner, invoice.id, { buffer: PNG, filename: "bukti transfer.png", contentType: "image/png" });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data).toMatchObject({ status: "awaiting_confirmation", proof: { name: "bukti transfer.png", contentType: "image/png", size: PNG.length } });
    expect(res.body.data.claimedAt).not.toBeNull();

    const overview = await getAs(ws.tokens.owner, "/billing");
    expect(overview.body.data.invoice).toMatchObject({ id: invoice.id, status: "awaiting_confirmation" });
    expect((await getAs(ws.tokens.owner, `/billing/invoices/${invoice.id}/qris`)).status).toBe(409);
    expect((await claimAs(ws.tokens.owner, invoice.id)).status).toBe(409);

    const audits = await withTenant(db, { tenantId: ws.tenantId, userId: null }, (tx) =>
      tx.select({ action: auditLogs.action, after: auditLogs.after }).from(auditLogs).where(and(eq(auditLogs.entity, "billing_invoice"), eq(auditLogs.entityId, invoice.id))),
    );
    expect(audits).toMatchObject([{ action: "claim", after: { status: "awaiting_confirmation", totalAmount: invoice.totalAmount, proof: "(diunggah)" } }]);
  });

  it("usaha baca-saja tetap bisa melaporkan bayar (tanpa bukti); tagihan kedaluwarsa ditolak", async () => {
    const ws = await createWorkspace("Toko Baca Saja Bayar");
    await setSubscription(ws.tenantId, "trialing", { trialEndsAt: new Date(Date.now() - 20 * DAY) });
    // Mutasi lain tetap 402
    const blocked = await request(server).put("/company").set("Authorization", `Bearer ${ws.tokens.owner}`).send({ name: "Ganti" });
    expect(blocked.status).toBe(402);

    const expired = await insertInvoice(ws.tenantId, { issuedAt: new Date(Date.now() - 20 * DAY), dueAt: new Date(Date.now() - DAY) });
    expect((await claimAs(ws.tokens.owner, expired.id)).status).toBe(409);
    expect((await getAs(ws.tokens.owner, `/billing/invoices/${expired.id}/qris`)).status).toBe(409);

    await expireOverdue(ws.tenantId);
    const invoice = await insertInvoice(ws.tenantId);
    const res = await claimAs(ws.tokens.owner, invoice.id);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data).toMatchObject({ status: "awaiting_confirmation", proof: null });
  });
});

import "reflect-metadata";
import { createHash, randomBytes, randomUUID } from "node:crypto";

import * as schema from "@exapay/db";
import { auditLogs, billingConfirmationTokens, billingInvoices, billingPrices, memberships, tenants, tenantSubscriptions, users } from "@exapay/db";
import { addSubscriptionMonth, type SubscriptionStatus } from "@exapay/shared";
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

// Verifikasi feature 42: konfirmasi / tolak pembayaran dari dashboard super-admin dan dari tautan email tanpa login
// (token sekali pakai, kedaluwarsa, terikat klaim; membaca tidak mengubah data); perpanjangan 1 bulan kalender; usaha
// baca-saja kembali normal; kelola langganan (trial, gratis, harga khusus); versi harga platform.

const PASSWORD = "password-billing-admin-123";
const DAY = 24 * 60 * 60 * 1000;

let app: INestApplication;
let server: Parameters<typeof request>[0];
let pool: pg.Pool;
let ownerPool: pg.Pool;
let db: Database;
let ownerDb: NodePgDatabase;
let superAdminToken: string;
let nextCode = 300;

type Workspace = { tenantId: string; ownerId: string; ownerToken: string; adminToken: string };

async function createUser(email: string, fullName: string): Promise<string> {
  const id = randomUUID();
  const passwordHash = await hash(PASSWORD);
  await withUser(db, id, (tx) => tx.insert(users).values({ id, email, fullName, passwordHash, emailVerifiedAt: new Date() }));
  return id;
}

async function tokenOf(email: string): Promise<string> {
  const res = await request(server).post("/auth/login").send({ email, password: PASSWORD, client: "mobile" });
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return String(res.body.data.tokens.accessToken);
}

async function createWorkspace(name: string): Promise<Workspace> {
  const tenantId = randomUUID();
  const emails = { owner: `owner-${randomUUID().slice(0, 8)}@test.exapay.local`, admin: `admin-${randomUUID().slice(0, 8)}@test.exapay.local` };
  const ownerId = await createUser(emails.owner, `Owner ${name}`);
  const adminId = await createUser(emails.admin, `Admin ${name}`);
  await withTenant(db, { tenantId, userId: ownerId }, async (tx) => {
    await tx.insert(tenants).values({ id: tenantId, name });
    await tx.insert(memberships).values({ tenantId, userId: ownerId, role: "owner" });
  });
  await withTenant(db, { tenantId, userId: adminId }, (tx) => tx.insert(memberships).values({ tenantId, userId: adminId, role: "admin" }));
  return { tenantId, ownerId, ownerToken: await tokenOf(emails.owner), adminToken: await tokenOf(emails.admin) };
}

async function setSubscription(tenantId: string, status: SubscriptionStatus, dates: { trialEndsAt?: Date; currentPeriodEndsAt?: Date } = {}): Promise<void> {
  await ownerDb.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.tenant_id', ${tenantId}, true)`);
    const values = { status, trialEndsAt: dates.trialEndsAt ?? null, currentPeriodEndsAt: dates.currentPeriodEndsAt ?? null };
    await tx.insert(tenantSubscriptions).values({ tenantId, ...values }).onConflictDoUpdate({ target: tenantSubscriptions.tenantId, set: values });
  });
}

async function subscriptionOf(tenantId: string) {
  const [row] = await withTenant(db, { tenantId, userId: null }, (tx) =>
    tx.select({ status: tenantSubscriptions.status, trialEndsAt: tenantSubscriptions.trialEndsAt, currentPeriodEndsAt: tenantSubscriptions.currentPeriodEndsAt }).from(tenantSubscriptions),
  );
  if (!row) throw new Error("langganan tidak ada");
  return row;
}

// Tagihan berjalan seperti terbitan worker, lalu (opsional) diklaim owner lewat API
async function claimedInvoice(ws: Workspace): Promise<{ id: string; totalAmount: string }> {
  const uniqueCode = nextCode++;
  const [invoice] = await withTenant(db, { tenantId: ws.tenantId, userId: null }, (tx) =>
    tx
      .insert(billingInvoices)
      .values({
        tenantId: ws.tenantId,
        number: `EXA-T42-${randomUUID().slice(0, 8).toUpperCase()}`,
        periodStart: "2026-10-10",
        dueAt: new Date(Date.now() + 14 * DAY),
        pricePerEmployee: "10000",
        minBilledEmployees: 5,
        activeEmployees: 2,
        billedEmployees: 5,
        baseAmount: "50000",
        uniqueCode,
        totalAmount: String(50000 + uniqueCode),
      })
      .returning({ id: billingInvoices.id, totalAmount: billingInvoices.totalAmount }),
  );
  if (!invoice) throw new Error("gagal membuat tagihan");
  const claim = await request(server).post(`/billing/invoices/${invoice.id}/claim`).set("Authorization", `Bearer ${ws.ownerToken}`).field("note", "");
  expect(claim.status, JSON.stringify(claim.body)).toBe(200);
  return invoice;
}

// Token konfirmasi seperti yang dibuat worker saat mengirim email (app_user boleh INSERT; hanya hash disimpan)
async function confirmationToken(tenantId: string, invoiceId: string, expiresAt = new Date(Date.now() + 7 * DAY)): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await withTenant(db, { tenantId, userId: null }, async (tx) => {
    const [invoice] = await tx.select({ claimedAt: billingInvoices.claimedAt }).from(billingInvoices).where(eq(billingInvoices.id, invoiceId));
    if (!invoice?.claimedAt) throw new Error("tagihan belum diklaim");
    await tx.insert(billingConfirmationTokens).values({
      tenantId,
      invoiceId,
      tokenHash: createHash("sha256").update(token).digest("hex"),
      claimedAt: invoice.claimedAt,
      expiresAt,
    });
  });
  return token;
}

function adminPost(path: string, body: object = {}): request.Test {
  return request(server).post(path).set("Authorization", `Bearer ${superAdminToken}`).send(body);
}

function publicPost(path: string, body: object): request.Test {
  return request(server).post(path).send(body);
}

async function invoiceStatus(tenantId: string, invoiceId: string): Promise<string | undefined> {
  const [row] = await withTenant(db, { tenantId, userId: null }, (tx) => tx.select({ status: billingInvoices.status }).from(billingInvoices).where(eq(billingInvoices.id, invoiceId)));
  return row?.status;
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

  const email = `sa-${randomUUID().slice(0, 8)}@test.exapay.local`;
  const superAdminId = await createUser(email, "Super Admin");
  await ownerDb.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.user_id', ${superAdminId}, true)`);
    await tx.update(users).set({ isSuperAdmin: true }).where(eq(users.id, superAdminId));
  });
  superAdminToken = await tokenOf(email);
});

afterAll(async () => {
  // Kembalikan harga platform seperti seed migration (versi uji 2099 dihapus) — file test lain menghitung harga masa depan
  await ownerDb.transaction(async (tx) => {
    await tx.execute(sql`DELETE FROM billing_prices WHERE effective_from >= '2099-01-01'`);
    await tx.execute(sql`UPDATE billing_prices SET effective_to = NULL WHERE effective_from = '2024-01-01'`);
  });
  await app?.close();
  await pool?.end();
  await ownerPool?.end();
});

describe("konfirmasi dari dashboard super-admin", () => {
  it("antrean lintas usaha; konfirmasi → lunas, trial +1 bulan kalender dari akhir trial, audit", async () => {
    const ws = await createWorkspace("Toko Konfirmasi");
    const trialEndsAt = new Date(Date.now() + 5 * DAY);
    await setSubscription(ws.tenantId, "trialing", { trialEndsAt });
    const invoice = await claimedInvoice(ws);

    const overview = await request(server).get("/admin/billing").set("Authorization", `Bearer ${superAdminToken}`);
    expect(overview.status, JSON.stringify(overview.body)).toBe(200);
    expect(overview.body.data.queue).toEqual(
      expect.arrayContaining([expect.objectContaining({ invoiceId: invoice.id, tenantId: ws.tenantId, tenantName: "Toko Konfirmasi", totalAmount: invoice.totalAmount, hasProof: false })]),
    );
    // Bukan super-admin → 403
    expect((await request(server).get("/admin/billing").set("Authorization", `Bearer ${ws.ownerToken}`)).status).toBe(403);

    const res = await adminPost(`/admin/tenants/${ws.tenantId}/invoices/${invoice.id}/confirm`);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(await invoiceStatus(ws.tenantId, invoice.id)).toBe("paid");
    const subscription = await subscriptionOf(ws.tenantId);
    expect(subscription.status).toBe("active");
    expect(subscription.currentPeriodEndsAt?.toISOString()).toBe(addSubscriptionMonth(trialEndsAt).toISOString());

    const audits = await withTenant(db, { tenantId: ws.tenantId, userId: null }, (tx) =>
      tx.select({ entity: auditLogs.entity, action: auditLogs.action }).from(auditLogs).where(sql`${auditLogs.action} IN ('confirm_payment', 'renew')`),
    );
    expect(audits.map((audit) => audit.action).sort()).toEqual(["confirm_payment", "renew"]);
    // Diputuskan dua kali → 409
    expect((await adminPost(`/admin/tenants/${ws.tenantId}/invoices/${invoice.id}/confirm`)).status).toBe(409);
  });

  it("usaha baca-saja: konfirmasi → aktif 1 bulan dari sekarang dan mutasi langsung diizinkan lagi", async () => {
    const ws = await createWorkspace("Toko Terkunci Bayar");
    await setSubscription(ws.tenantId, "trialing", { trialEndsAt: new Date(Date.now() - 20 * DAY) });
    const invoice = await claimedInvoice(ws);
    expect((await request(server).put("/company").set("Authorization", `Bearer ${ws.ownerToken}`).send({ name: "Toko Terkunci Bayar" })).status).toBe(402);

    const before = Date.now();
    expect((await adminPost(`/admin/tenants/${ws.tenantId}/invoices/${invoice.id}/confirm`)).status).toBe(200);
    const subscription = await subscriptionOf(ws.tenantId);
    const end = subscription.currentPeriodEndsAt?.getTime() ?? 0;
    expect(end).toBeGreaterThanOrEqual(addSubscriptionMonth(new Date(before)).getTime());
    expect(end).toBeLessThan(addSubscriptionMonth(new Date(Date.now() + 60_000)).getTime());
    // Guard baca-saja tidak lagi menahan (body minimal → sampai validasi, 400 — bukan 402)
    expect((await request(server).put("/company").set("Authorization", `Bearer ${ws.ownerToken}`).send({ name: "Toko Terkunci Bayar" })).status).not.toBe(402);
  });

  it("tolak wajib alasan → tagihan kembali bisa dibayar + alasan tampil ke owner; owner bisa melapor ulang", async () => {
    const ws = await createWorkspace("Toko Ditolak");
    await setSubscription(ws.tenantId, "trialing", { trialEndsAt: new Date(Date.now() + 3 * DAY) });
    const invoice = await claimedInvoice(ws);

    expect((await adminPost(`/admin/tenants/${ws.tenantId}/invoices/${invoice.id}/reject`, { reason: "x" })).status).toBe(400);
    const res = await adminPost(`/admin/tenants/${ws.tenantId}/invoices/${invoice.id}/reject`, { reason: "Nominal tidak ada di mutasi" });
    expect(res.status, JSON.stringify(res.body)).toBe(200);

    const overview = await request(server).get("/billing").set("Authorization", `Bearer ${ws.ownerToken}`);
    expect(overview.body.data.invoice).toMatchObject({ id: invoice.id, status: "open", claimedAt: null, rejection: { reason: "Nominal tidak ada di mutasi" } });
    expect((await subscriptionOf(ws.tenantId)).status).toBe("trialing");

    const again = await request(server).post(`/billing/invoices/${invoice.id}/claim`).set("Authorization", `Bearer ${ws.ownerToken}`).field("note", "");
    expect(again.status, JSON.stringify(again.body)).toBe(200);
    expect(again.body.data.status).toBe("awaiting_confirmation");
  });
});

describe("konfirmasi dari tautan email (tanpa login)", () => {
  it("lookup hanya membaca; konfirmasi sekali; tautan dipakai ulang ditolak", async () => {
    const ws = await createWorkspace("Toko Email");
    const periodEnd = new Date(Date.now() + 2 * DAY);
    await setSubscription(ws.tenantId, "active", { currentPeriodEndsAt: periodEnd });
    const invoice = await claimedInvoice(ws);
    const token = await confirmationToken(ws.tenantId, invoice.id);

    for (let i = 0; i < 2; i++) {
      const lookup = await publicPost("/billing/confirmations/lookup", { token });
      expect(lookup.status, JSON.stringify(lookup.body)).toBe(200);
      expect(lookup.body.data).toMatchObject({ state: "pending", tenantName: "Toko Email", totalAmount: invoice.totalAmount, invoiceStatus: "awaiting_confirmation" });
    }
    expect(await invoiceStatus(ws.tenantId, invoice.id)).toBe("awaiting_confirmation");

    const confirm = await publicPost("/billing/confirmations/confirm", { token });
    expect(confirm.status, JSON.stringify(confirm.body)).toBe(200);
    expect(confirm.body.data).toMatchObject({ state: "decided", invoiceStatus: "paid", periodEndsAt: addSubscriptionMonth(periodEnd).toISOString() });
    expect((await subscriptionOf(ws.tenantId)).currentPeriodEndsAt?.toISOString()).toBe(addSubscriptionMonth(periodEnd).toISOString());

    expect((await publicPost("/billing/confirmations/confirm", { token })).status).toBe(409);
    expect((await publicPost("/billing/confirmations/reject", { token, reason: "Coba tolak setelah lunas" })).status).toBe(409);

    const [decision] = await withTenant(db, { tenantId: ws.tenantId, userId: null }, (tx) =>
      tx.select({ actor: auditLogs.actorUserId, after: auditLogs.after }).from(auditLogs).where(and(eq(auditLogs.entityId, invoice.id), eq(auditLogs.action, "confirm_payment"))),
    );
    expect(decision).toMatchObject({ actor: null, after: { source: "email" } });
  });

  it("tolak dari email; tautan klaim lama tidak berlaku setelah owner melapor ulang; kedaluwarsa & token palsu ditolak", async () => {
    const ws = await createWorkspace("Toko Email Tolak");
    await setSubscription(ws.tenantId, "trialing", { trialEndsAt: new Date(Date.now() + 4 * DAY) });
    const invoice = await claimedInvoice(ws);
    const first = await confirmationToken(ws.tenantId, invoice.id);

    expect((await publicPost("/billing/confirmations/reject", { token: first, reason: "ok" })).status).toBe(400);
    const rejected = await publicPost("/billing/confirmations/reject", { token: first, reason: "Belum ada di mutasi merchant" });
    expect(rejected.status, JSON.stringify(rejected.body)).toBe(200);
    expect(rejected.body.data).toMatchObject({ state: "decided", invoiceStatus: "open" });

    // Owner melapor ulang → tautan baru; tautan lama (klaim pertama) tidak bisa dipakai walau belum kedaluwarsa
    await request(server).post(`/billing/invoices/${invoice.id}/claim`).set("Authorization", `Bearer ${ws.ownerToken}`).field("note", "");
    const stale = await confirmationToken(ws.tenantId, invoice.id);
    // stale dibuat untuk klaim baru — ganti klaim sekali lagi lewat penolakan dashboard agar stale merujuk klaim lama
    await adminPost(`/admin/tenants/${ws.tenantId}/invoices/${invoice.id}/reject`, { reason: "Ditolak lagi dari dashboard" });
    await request(server).post(`/billing/invoices/${invoice.id}/claim`).set("Authorization", `Bearer ${ws.ownerToken}`).field("note", "");
    expect((await publicPost("/billing/confirmations/lookup", { token: stale })).body.data.state).toBe("decided");
    expect((await publicPost("/billing/confirmations/confirm", { token: stale })).status).toBe(409);
    expect(await invoiceStatus(ws.tenantId, invoice.id)).toBe("awaiting_confirmation");

    const expired = await confirmationToken(ws.tenantId, invoice.id, new Date(Date.now() - 1000));
    expect((await publicPost("/billing/confirmations/lookup", { token: expired })).body.data.state).toBe("expired");
    expect((await publicPost("/billing/confirmations/confirm", { token: expired })).status).toBe(409);

    expect((await publicPost("/billing/confirmations/lookup", { token: randomBytes(32).toString("base64url") })).status).toBe(410);
    expect(await invoiceStatus(ws.tenantId, invoice.id)).toBe("awaiting_confirmation");
  });

  it("database: tanpa super-admin / token di transaksi yang sama, tagihan tidak bisa dilunasi & langganan tidak bisa diperpanjang", async () => {
    const ws = await createWorkspace("Toko Pengaman");
    await setSubscription(ws.tenantId, "trialing", { trialEndsAt: new Date(Date.now() + 4 * DAY) });
    const invoice = await claimedInvoice(ws);
    const token = await confirmationToken(ws.tenantId, invoice.id);
    const asOwner = { tenantId: ws.tenantId, userId: ws.ownerId };

    await expect(
      withTenant(db, asOwner, (tx) => tx.update(billingInvoices).set({ status: "paid", paidAt: new Date() }).where(eq(billingInvoices.id, invoice.id))),
    ).rejects.toThrow();
    await expect(withTenant(db, asOwner, (tx) => tx.update(tenantSubscriptions).set({ status: "active", currentPeriodEndsAt: new Date(Date.now() + 400 * DAY) }))).rejects.toThrow();
    // Token baru tidak boleh dibuat sudah terpakai (hanya fungsi definer yang mengisi used_*)
    await expect(
      withTenant(db, asOwner, (tx) =>
        tx.insert(billingConfirmationTokens).values({
          tenantId: ws.tenantId,
          invoiceId: invoice.id,
          tokenHash: randomBytes(16).toString("hex"),
          claimedAt: new Date(),
          expiresAt: new Date(Date.now() + DAY),
          usedAt: new Date(),
          usedTxid: 1,
        }),
      ),
    ).rejects.toThrow();
    // Token dipakai di transaksi LAIN tidak membuka izin di transaksi ini
    await withTenant(db, asOwner, (tx) => tx.execute(sql`SELECT * FROM public.billing_consume_confirmation(${createHash("sha256").update(token).digest("hex")})`));
    await expect(
      withTenant(db, asOwner, (tx) => tx.update(billingInvoices).set({ status: "paid", paidAt: new Date() }).where(eq(billingInvoices.id, invoice.id))),
    ).rejects.toThrow();
    expect(await invoiceStatus(ws.tenantId, invoice.id)).toBe("awaiting_confirmation");
  });
});

describe("kelola langganan & harga", () => {
  it("perpanjang trial, jadikan gratis (tagihan open dibatalkan), harga khusus dipakai estimasi", async () => {
    const ws = await createWorkspace("Toko Kelola");
    const trialEndsAt = new Date(Date.now() + 3 * DAY);
    await setSubscription(ws.tenantId, "trialing", { trialEndsAt });

    expect((await adminPost(`/admin/tenants/${ws.tenantId}/subscription/trial`, { days: 14 })).status).toBe(200);
    expect((await subscriptionOf(ws.tenantId)).trialEndsAt?.getTime()).toBe(trialEndsAt.getTime() + 14 * DAY);

    const price = await request(server)
      .put(`/admin/tenants/${ws.tenantId}/subscription/price`)
      .set("Authorization", `Bearer ${superAdminToken}`)
      .send({ pricePerEmployee: "7500", minBilledEmployees: 2 });
    expect(price.status, JSON.stringify(price.body)).toBe(200);
    const estimate = await request(server).get("/billing").set("Authorization", `Bearer ${ws.ownerToken}`);
    expect(estimate.body.data.estimate).toMatchObject({ pricePerEmployee: "7500.00", minBilledEmployees: 2, billedEmployees: 2, amount: "15000.00" });

    const detail = await request(server).get(`/admin/tenants/${ws.tenantId}/subscription`).set("Authorization", `Bearer ${superAdminToken}`);
    expect(detail.body.data).toMatchObject({ pricePerEmployeeOverride: "7500.00", minBilledEmployeesOverride: 2, subscription: { status: "trialing" } });

    // Owner tidak bisa mengubah langganannya sendiri
    expect((await request(server).post(`/admin/tenants/${ws.tenantId}/subscription/complimentary`).set("Authorization", `Bearer ${ws.ownerToken}`)).status).toBe(403);

    const [open] = await withTenant(db, { tenantId: ws.tenantId, userId: null }, (tx) =>
      tx
        .insert(billingInvoices)
        .values({
          tenantId: ws.tenantId,
          number: `EXA-T42-${randomUUID().slice(0, 8).toUpperCase()}`,
          periodStart: "2026-10-10",
          dueAt: new Date(Date.now() + 14 * DAY),
          pricePerEmployee: "7500",
          minBilledEmployees: 2,
          activeEmployees: 0,
          billedEmployees: 2,
          baseAmount: "15000",
          uniqueCode: nextCode,
          totalAmount: String(15000 + nextCode++),
        })
        .returning({ id: billingInvoices.id }),
    );
    expect((await adminPost(`/admin/tenants/${ws.tenantId}/subscription/complimentary`)).status).toBe(200);
    expect((await subscriptionOf(ws.tenantId)).status).toBe("complimentary");
    expect(await invoiceStatus(ws.tenantId, open?.id ?? "")).toBe("expired");

    // Dari gratis bisa diberi trial lagi; langganan berbayar tidak bisa dijadikan trial
    expect((await adminPost(`/admin/tenants/${ws.tenantId}/subscription/trial`, { days: 30 })).status).toBe(200);
    expect((await subscriptionOf(ws.tenantId)).status).toBe("trialing");
    await setSubscription(ws.tenantId, "active", { currentPeriodEndsAt: new Date(Date.now() + 20 * DAY) });
    expect((await adminPost(`/admin/tenants/${ws.tenantId}/subscription/trial`, { days: 7 })).status).toBe(409);
  });

  it("versi harga platform: paling cepat besok; versi berjalan ditutup sehari sebelumnya; bukan super-admin ditolak di database", async () => {
    expect((await adminPost("/admin/billing/prices", { pricePerEmployee: "12000", minBilledEmployees: 5, trialDays: 14, graceDays: 7, effectiveFrom: "2020-01-01" })).status).toBe(400);
    const res = await adminPost("/admin/billing/prices", {
      pricePerEmployee: "12000",
      minBilledEmployees: 5,
      trialDays: 14,
      graceDays: 7,
      effectiveFrom: "2099-01-01",
      note: "Uji harga",
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.data.slice(0, 2)).toMatchObject([
      { pricePerEmployee: "12000.00", effectiveFrom: "2099-01-01", effectiveTo: null, note: "Uji harga" },
      { pricePerEmployee: "10000.00", effectiveFrom: "2024-01-01", effectiveTo: "2098-12-31" },
    ]);
    // Simpan ulang tanggal sama → menggantikan jadwal, bukan menumpuk
    await adminPost("/admin/billing/prices", { pricePerEmployee: "11000", minBilledEmployees: 5, trialDays: 30, graceDays: 7, effectiveFrom: "2099-01-01" });
    const overview = await request(server).get("/admin/billing").set("Authorization", `Bearer ${superAdminToken}`);
    expect(overview.body.data.prices.filter((version: { effectiveFrom: string }) => version.effectiveFrom === "2099-01-01")).toMatchObject([{ pricePerEmployee: "11000.00" }]);

    // app_user tanpa flag super-admin tidak bisa menulis harga (trigger)
    const ws = await createWorkspace("Toko Harga");
    await expect(
      withTenant(db, { tenantId: ws.tenantId, userId: ws.ownerId }, (tx) =>
        tx.insert(billingPrices).values({ pricePerEmployee: "1", minBilledEmployees: 0, trialDays: 1, graceDays: 1, effectiveFrom: "2199-01-01" }),
      ),
    ).rejects.toThrow();
  });
});

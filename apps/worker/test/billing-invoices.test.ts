import "reflect-metadata";
import { createHash, randomUUID } from "node:crypto";

import * as schema from "@exapay/db";
import { billingConfirmationTokens, billingInvoices, type Database, departments, employees, memberships, positions, tenants, tenantSubscriptions, users, withTenant, withUser } from "@exapay/db";
import { type SubscriptionStatus } from "@exapay/shared";
import { ConfigService } from "@nestjs/config";
import { eq, sql } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";

import type { Env } from "../src/config/env.js";
import { type EmailMessage, Mailer } from "../src/email/mailer.js";
import { BillingInvoices } from "../src/processors/billing-invoices.js";

// Verifikasi feature 41 (worker): tagihan terbit H-7 sebelum trial/periode berakhir dengan snapshot karyawan aktif ×
// harga (min. ditagih) + kode unik 1–999; satu tagihan berjalan per usaha; nominal tagihan berjalan unik seluruh
// platform; tagihan lewat batas → expired + terbit baru; email tagihan ke owner & pemberitahuan klaim ke pemilik platform.

const DAY = 24 * 60 * 60 * 1000;
const PLATFORM_EMAIL = "platform@exapay.test";

let pool: pg.Pool;
let ownerPool: pg.Pool;
let db: Database;
let ownerDb: NodePgDatabase;

class FakeMailer extends Mailer {
  readonly sent: EmailMessage[] = [];
  async send(message: EmailMessage): Promise<void> {
    this.sent.push(message);
  }
}

type Workspace = { tenantId: string; ownerId: string; ownerEmail: string };

// Owner terverifikasi + admin (bukan penerima email tagihan)
async function createWorkspace(name: string): Promise<Workspace> {
  const tenantId = randomUUID();
  let ownerId = "";
  let ownerEmail = "";
  for (const role of ["owner", "admin"] as const) {
    const id = randomUUID();
    const email = `${role}-${randomUUID().slice(0, 8)}@test.exapay.local`;
    if (role === "owner") {
      ownerId = id;
      ownerEmail = email;
    }
    await withUser(db, id, (tx) => tx.insert(users).values({ id, email, fullName: `${role} ${name}`, emailVerifiedAt: new Date() }));
    await withTenant(db, { tenantId, userId: id }, async (tx) => {
      if (role === "owner") await tx.insert(tenants).values({ id: tenantId, name });
      await tx.insert(memberships).values({ tenantId, userId: id, role });
    });
  }
  return { tenantId, ownerId, ownerEmail };
}

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

function createInvoices(mailer: FakeMailer, notifyEmails: string[] = [PLATFORM_EMAIL]): BillingInvoices {
  const config = new ConfigService<Env, true>({ APP_WEB_URL: "https://app.exapay.test", BILLING_NOTIFY_EMAIL: notifyEmails });
  return new BillingInvoices(db, mailer, config);
}

async function invoicesOf(tenantId: string) {
  return withTenant(db, { tenantId, userId: null }, (tx) =>
    tx
      .select({
        id: billingInvoices.id,
        number: billingInvoices.number,
        status: billingInvoices.status,
        periodStart: billingInvoices.periodStart,
        issuedAt: billingInvoices.issuedAt,
        dueAt: billingInvoices.dueAt,
        activeEmployees: billingInvoices.activeEmployees,
        billedEmployees: billingInvoices.billedEmployees,
        pricePerEmployee: billingInvoices.pricePerEmployee,
        baseAmount: billingInvoices.baseAmount,
        uniqueCode: billingInvoices.uniqueCode,
        totalAmount: billingInvoices.totalAmount,
      })
      .from(billingInvoices)
      .orderBy(billingInvoices.issuedAt),
  );
}

// Tanggal kalender WIB (YYYY-MM-DD)
function wibDate(instant: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(instant);
}

beforeAll(() => {
  pool = new pg.Pool({ connectionString: inject("testDatabaseUrl") });
  ownerPool = new pg.Pool({ connectionString: inject("testOwnerDatabaseUrl") });
  db = drizzle({ client: pool, schema });
  ownerDb = drizzle({ client: ownerPool });
});

afterAll(async () => {
  await pool?.end();
  await ownerPool?.end();
});

describe("BillingInvoices.issue", () => {
  it("trial H-8 belum ada tagihan; H-7 terbit sekali dengan snapshot minimum ditagih + kode unik; email ke owner", async () => {
    const ws = await createWorkspace("Toko Tagihan");
    await addEmployees(ws.tenantId, 3, 2);
    const trialEndsAt = new Date(Date.now() + 30 * DAY);
    await setSubscription(ws.tenantId, "trialing", { trialEndsAt });
    const mailer = new FakeMailer();
    const invoices = createInvoices(mailer);

    await invoices.issue({ tenantId: ws.tenantId }, new Date(trialEndsAt.getTime() - 8 * DAY));
    expect(await invoicesOf(ws.tenantId)).toHaveLength(0);

    const issuedAt = new Date(trialEndsAt.getTime() - 7 * DAY);
    await invoices.issue({ tenantId: ws.tenantId }, issuedAt);
    await invoices.issue({ tenantId: ws.tenantId }, new Date(issuedAt.getTime() + DAY));
    const rows = await invoicesOf(ws.tenantId);
    expect(rows).toHaveLength(1);
    const [invoice] = rows;
    if (!invoice) throw new Error("tagihan tidak terbit");
    expect(invoice).toMatchObject({
      status: "open",
      periodStart: wibDate(trialEndsAt),
      activeEmployees: 3,
      billedEmployees: 5,
      pricePerEmployee: "10000.00",
      baseAmount: "50000.00",
    });
    expect(invoice.uniqueCode).toBeGreaterThanOrEqual(1);
    expect(invoice.uniqueCode).toBeLessThanOrEqual(999);
    expect(invoice.totalAmount).toBe(`${50000 + invoice.uniqueCode}.00`);
    expect(invoice.number).toMatch(/^EXA-\d{4}-[2-9A-HJ-NP-Z]{6}$/);
    // Berlaku 14 hari kalender sampai akhir hari WIB = akhir masa tenggang 7 hari
    expect(wibDate(invoice.dueAt)).toBe(wibDate(new Date(issuedAt.getTime() + 14 * DAY)));
    expect(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jakarta", timeStyle: "medium" }).format(invoice.dueAt)).toBe("23:59:59");

    expect(mailer.sent).toHaveLength(1);
    expect(mailer.sent[0]?.to).toBe(ws.ownerEmail);
    expect(mailer.sent[0]?.subject).toBe(`Tagihan Exapay ${invoice.number} — Toko Tagihan`);
    expect(mailer.sent[0]?.text).toContain(`Rp ${(50000 + invoice.uniqueCode).toLocaleString("id-ID")}`);
    expect(mailer.sent[0]?.text).toContain("5 karyawan × Rp 10.000");
    expect(mailer.sent[0]?.text).toContain("https://app.exapay.test/settings/billing");
  });

  it("di atas minimum: karyawan aktif × harga (keluar tidak dihitung); periode aktif H-7; gratis & periode panjang tidak ditagih", async () => {
    const ws = await createWorkspace("Toko Besar");
    await addEmployees(ws.tenantId, 7, 2);
    const periodEnd = new Date(Date.now() + 20 * DAY);
    await setSubscription(ws.tenantId, "active", { currentPeriodEndsAt: periodEnd });
    const invoices = createInvoices(new FakeMailer());

    await invoices.issue({ tenantId: ws.tenantId }, new Date());
    expect(await invoicesOf(ws.tenantId)).toHaveLength(0);
    await invoices.issue({ tenantId: ws.tenantId }, new Date(periodEnd.getTime() - 6 * DAY));
    expect(await invoicesOf(ws.tenantId)).toMatchObject([{ activeEmployees: 7, billedEmployees: 7, baseAmount: "70000.00" }]);

    const pilot = await createWorkspace("Toko Pilot");
    await setSubscription(pilot.tenantId, "complimentary");
    await invoices.issue({ tenantId: pilot.tenantId }, new Date(Date.now() + 400 * DAY));
    expect(await invoicesOf(pilot.tenantId)).toHaveLength(0);
  });

  it("baca-saja tanpa tagihan → terbit dengan periode mulai hari ini", async () => {
    const ws = await createWorkspace("Toko Terkunci");
    await setSubscription(ws.tenantId, "trialing", { trialEndsAt: new Date(Date.now() - 20 * DAY) });
    const now = new Date();
    await createInvoices(new FakeMailer()).issue({ tenantId: ws.tenantId }, now);
    expect(await invoicesOf(ws.tenantId)).toMatchObject([{ status: "open", periodStart: wibDate(now) }]);
  });

  it("tagihan lewat batas bayar → expired lalu terbit tagihan baru; menunggu konfirmasi menahan tagihan baru", async () => {
    const ws = await createWorkspace("Toko Kedaluwarsa");
    await setSubscription(ws.tenantId, "trialing", { trialEndsAt: new Date(Date.now() - 20 * DAY) });
    // Tagihan lama dengan batas bayar di masa lalu (hanya app_owner yang bisa membuat tanggal bebas)
    await ownerDb.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.tenant_id', ${ws.tenantId}, true)`);
      await tx.insert(billingInvoices).values({
        tenantId: ws.tenantId,
        number: `EXA-TEST-${randomUUID().slice(0, 8)}`,
        periodStart: wibDate(new Date(Date.now() - 20 * DAY)),
        issuedAt: new Date(Date.now() - 27 * DAY),
        dueAt: new Date(Date.now() - 13 * DAY),
        pricePerEmployee: "10000",
        minBilledEmployees: 5,
        activeEmployees: 0,
        billedEmployees: 5,
        baseAmount: "50000",
        uniqueCode: 999,
        totalAmount: "50999",
      });
    });
    const mailer = new FakeMailer();
    const invoices = createInvoices(mailer);
    await invoices.issue({ tenantId: ws.tenantId });
    const rows = await invoicesOf(ws.tenantId);
    expect(rows.map((row) => row.status)).toEqual(["expired", "open"]);
    expect(mailer.sent).toHaveLength(1);

    // Owner melaporkan bayar → tagihan tetap berjalan (menunggu konfirmasi), tidak ada tagihan baru
    const current = rows[1];
    if (!current) throw new Error("tagihan baru tidak terbit");
    await withTenant(db, { tenantId: ws.tenantId, userId: ws.ownerId }, (tx) =>
      tx.update(billingInvoices).set({ status: "awaiting_confirmation", claimedAt: new Date(), claimedByUserId: ws.ownerId }).where(eq(billingInvoices.id, current.id)),
    );
    await invoices.issue({ tenantId: ws.tenantId });
    expect((await invoicesOf(ws.tenantId)).map((row) => row.status)).toEqual(["expired", "awaiting_confirmation"]);
  });

  it("nominal tagihan berjalan unik di seluruh platform", async () => {
    const workspaces = await Promise.all(Array.from({ length: 12 }, (_, index) => createWorkspace(`Toko Unik ${index + 1}`)));
    const invoices = createInvoices(new FakeMailer());
    for (const ws of workspaces) {
      await setSubscription(ws.tenantId, "trialing", { trialEndsAt: new Date(Date.now() + 3 * DAY) });
    }
    await Promise.all(workspaces.map((ws) => invoices.issue({ tenantId: ws.tenantId })));

    // Dibaca per tenant (RLS) lalu dibandingkan di sini
    const totals = (await Promise.all(workspaces.map((ws) => invoicesOf(ws.tenantId)))).flat().map((row) => row.totalAmount);
    expect(totals).toHaveLength(12);
    expect(new Set(totals).size).toBe(12);
  });
});

describe("billing_invoices — pengaman database", () => {
  it("nominal sama untuk tagihan berjalan usaha lain ditolak; isolasi tenant; app_user tidak bisa mengubah nominal / melunasi", async () => {
    const a = await createWorkspace("Toko Guard A");
    const b = await createWorkspace("Toko Guard B");
    await setSubscription(a.tenantId, "trialing", { trialEndsAt: new Date(Date.now() + 2 * DAY) });
    await createInvoices(new FakeMailer()).issue({ tenantId: a.tenantId });
    const [invoice] = await invoicesOf(a.tenantId);
    if (!invoice) throw new Error("tagihan tidak terbit");

    // Konteks B tidak melihat tagihan A
    expect(await invoicesOf(b.tenantId)).toEqual([]);

    // Nominal sama dengan tagihan berjalan A → index unik lintas tenant
    await expect(
      withTenant(db, { tenantId: b.tenantId, userId: null }, (tx) =>
        tx.insert(billingInvoices).values({
          tenantId: b.tenantId,
          number: `EXA-TEST-${randomUUID().slice(0, 8)}`,
          periodStart: invoice.periodStart,
          dueAt: new Date(Date.now() + 14 * DAY),
          pricePerEmployee: invoice.pricePerEmployee,
          minBilledEmployees: 5,
          activeEmployees: 0,
          billedEmployees: 5,
          baseAmount: invoice.baseAmount,
          uniqueCode: invoice.uniqueCode,
          totalAmount: invoice.totalAmount,
        }),
      ),
    ).rejects.toThrow();

    const asA = { tenantId: a.tenantId, userId: a.ownerId };
    // Nominal tidak bisa diubah (grant UPDATE per kolom)
    await expect(withTenant(db, asA, (tx) => tx.update(billingInvoices).set({ totalAmount: "1.00" }).where(eq(billingInvoices.id, invoice.id)))).rejects.toThrow();
    // Lunas hanya super-admin (trigger)
    await expect(withTenant(db, asA, (tx) => tx.update(billingInvoices).set({ status: "paid" }).where(eq(billingInvoices.id, invoice.id)))).rejects.toThrow();
    // Expired sebelum batas bayar ditolak
    await expect(withTenant(db, asA, (tx) => tx.update(billingInvoices).set({ status: "expired" }).where(eq(billingInvoices.id, invoice.id)))).rejects.toThrow();
    // Tanpa DELETE
    await expect(withTenant(db, asA, (tx) => tx.delete(billingInvoices).where(eq(billingInvoices.id, invoice.id)))).rejects.toThrow();
    expect(await invoicesOf(a.tenantId)).toMatchObject([{ status: "open", totalAmount: invoice.totalAmount }]);
  });
});

describe("BillingInvoices.notifyClaim", () => {
  it("email ke pemilik platform berisi usaha, nomor, nominal persis — hanya selama menunggu konfirmasi", async () => {
    const ws = await createWorkspace("Toko Lapor Bayar");
    await addEmployees(ws.tenantId, 6, 0);
    await setSubscription(ws.tenantId, "trialing", { trialEndsAt: new Date(Date.now() + 5 * DAY) });
    const mailer = new FakeMailer();
    const invoices = createInvoices(mailer, [PLATFORM_EMAIL, "kedua@exapay.test"]);
    await invoices.issue({ tenantId: ws.tenantId });
    const [invoice] = await invoicesOf(ws.tenantId);
    if (!invoice) throw new Error("tagihan tidak terbit");

    // Belum diklaim → tidak ada pemberitahuan
    await invoices.notifyClaim({ tenantId: ws.tenantId, invoiceId: invoice.id });
    expect(mailer.sent).toHaveLength(1);

    await withTenant(db, { tenantId: ws.tenantId, userId: ws.ownerId }, (tx) =>
      tx.update(billingInvoices).set({ status: "awaiting_confirmation", claimedAt: new Date(), claimedByUserId: ws.ownerId }).where(eq(billingInvoices.id, invoice.id)),
    );
    await invoices.notifyClaim({ tenantId: ws.tenantId, invoiceId: invoice.id });
    const notice = mailer.sent[1];
    expect(notice?.to).toBe(`${PLATFORM_EMAIL}, kedua@exapay.test`);
    expect(notice?.subject).toBe(`Pembayaran dilaporkan: Toko Lapor Bayar — Rp ${(60000 + invoice.uniqueCode).toLocaleString("id-ID")}`);
    expect(notice?.text).toContain(invoice.number);
    expect(notice?.text).toContain("Bukti bayar: tidak ada");
    expect(notice?.text).toContain("https://app.exapay.test/admin/billing");
    // Tautan konfirmasi tanpa login (feature 42): hanya hash token yang disimpan, terikat klaim ini, berlaku 7 hari
    const token = notice?.text.match(/\/payment\/confirm\/([A-Za-z0-9_-]{40,})/)?.[1];
    expect(token).toBeDefined();
    const tokens = await withTenant(db, { tenantId: ws.tenantId, userId: null }, (tx) =>
      tx.select({ hash: billingConfirmationTokens.tokenHash, expiresAt: billingConfirmationTokens.expiresAt, usedAt: billingConfirmationTokens.usedAt }).from(billingConfirmationTokens),
    );
    expect(tokens).toHaveLength(1);
    expect(tokens[0]?.hash).toBe(createHash("sha256").update(token ?? "").digest("hex"));
    expect(tokens[0]?.usedAt).toBeNull();
    expect(Math.round(((tokens[0]?.expiresAt.getTime() ?? 0) - Date.now()) / (24 * 60 * 60 * 1000))).toBe(7);
    // Tanpa data karyawan
    expect(notice?.text).not.toContain("karyawan");

    // BILLING_NOTIFY_EMAIL kosong → dilewati tanpa error
    const silent = new FakeMailer();
    await createInvoices(silent, []).notifyClaim({ tenantId: ws.tenantId, invoiceId: invoice.id });
    expect(silent.sent).toHaveLength(0);
  });
});

describe("feature 42 — harga khusus & email keputusan", () => {
  it("tagihan terbit memakai harga khusus usaha (menimpa harga platform)", async () => {
    const ws = await createWorkspace("Toko Harga Khusus");
    await addEmployees(ws.tenantId, 1, 0);
    await setSubscription(ws.tenantId, "trialing", { trialEndsAt: new Date(Date.now() + 3 * DAY) });
    await ownerDb.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.tenant_id', ${ws.tenantId}, true)`);
      await tx.update(tenantSubscriptions).set({ pricePerEmployeeOverride: "200", minBilledEmployeesOverride: 5 }).where(eq(tenantSubscriptions.tenantId, ws.tenantId));
    });
    await createInvoices(new FakeMailer()).issue({ tenantId: ws.tenantId });
    expect(await invoicesOf(ws.tenantId)).toMatchObject([{ pricePerEmployee: "200.00", billedEmployees: 5, baseAmount: "1000.00" }]);
  });

  it("kuitansi setelah lunas & pemberitahuan penolakan ke owner; keputusan yang sudah berubah dilewati", async () => {
    const ws = await createWorkspace("Toko Kuitansi");
    const periodEnd = new Date(Date.now() + 40 * DAY);
    await setSubscription(ws.tenantId, "trialing", { trialEndsAt: new Date(Date.now() + 2 * DAY) });
    const invoices = createInvoices(new FakeMailer());
    await invoices.issue({ tenantId: ws.tenantId });
    const [invoice] = await invoicesOf(ws.tenantId);
    if (!invoice) throw new Error("tagihan tidak terbit");

    // Belum diputuskan → tidak ada email
    const mailer = new FakeMailer();
    const notifier = createInvoices(mailer);
    await notifier.notifyDecision({ tenantId: ws.tenantId, invoiceId: invoice.id });
    expect(mailer.sent).toHaveLength(0);

    // Ditolak (app_owner meniru keputusan) → email alasan
    await ownerDb.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.tenant_id', ${ws.tenantId}, true)`);
      await tx.update(billingInvoices).set({ rejectionReason: "Nominal belum masuk mutasi", rejectedAt: new Date(), decisionSource: "dashboard" }).where(eq(billingInvoices.id, invoice.id));
    });
    await notifier.notifyDecision({ tenantId: ws.tenantId, invoiceId: invoice.id });
    expect(mailer.sent[0]?.to).toBe(ws.ownerEmail);
    expect(mailer.sent[0]?.subject).toContain("belum dapat dikonfirmasi");
    expect(mailer.sent[0]?.text).toContain("Alasan: Nominal belum masuk mutasi");

    // Lunas → kuitansi dengan akhir periode
    await ownerDb.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.tenant_id', ${ws.tenantId}, true)`);
      await tx.update(billingInvoices).set({ status: "paid", paidAt: new Date() }).where(eq(billingInvoices.id, invoice.id));
      await tx.update(tenantSubscriptions).set({ status: "active", currentPeriodEndsAt: periodEnd }).where(eq(tenantSubscriptions.tenantId, ws.tenantId));
    });
    await notifier.notifyDecision({ tenantId: ws.tenantId, invoiceId: invoice.id });
    expect(mailer.sent[1]?.subject).toBe(`Kuitansi pembayaran Exapay ${invoice.number} — Toko Kuitansi`);
    expect(mailer.sent[1]?.text).toContain(`Jumlah dibayar: Rp ${Number(invoice.totalAmount).toLocaleString("id-ID")}`);
    expect(mailer.sent[1]?.text).toContain("Langganan aktif sampai:");
  });
});

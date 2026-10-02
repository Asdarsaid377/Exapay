import "reflect-metadata";
import { randomUUID } from "node:crypto";

import * as schema from "@exapay/db";
import { type Database, memberships, subscriptionNotices, tenants, tenantSubscriptions, users, withTenant, withUser } from "@exapay/db";
import type { MembershipRole, SubscriptionStatus } from "@exapay/shared";
import { ConfigService } from "@nestjs/config";
import { sql } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";

import type { Env } from "../src/config/env.js";
import { type EmailMessage, Mailer } from "../src/email/mailer.js";
import { BillingInvoices } from "../src/processors/billing-invoices.js";
import { BillingNoticeProcessor } from "../src/processors/billing-notice.processor.js";

// Verifikasi feature 40: email pengingat langganan dikirim ke owner pada hari yang tepat (tanggal digeser lewat
// parameter `now`), sekali per tahap per akhir periode, dan subscription_notices terisolasi per tenant.
// Database: globalSetup API (vitest.config.ts) dengan nama exapayroll_worker_test.

declare module "vitest" {
  export interface ProvidedContext {
    testDatabaseUrl: string;
    testOwnerDatabaseUrl: string;
  }
}

const DAY = 24 * 60 * 60 * 1000;

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

type Workspace = { tenantId: string; emails: Record<MembershipRole, string> };

// Owner terverifikasi + admin (bukan penerima) + owner kedua belum terverifikasi (bukan penerima)
async function createWorkspace(name: string): Promise<Workspace> {
  const tenantId = randomUUID();
  const emails: Record<MembershipRole, string> = { owner: "", admin: "", atasan: "", karyawan: "" };
  const members: { role: MembershipRole; verified: boolean }[] = [
    { role: "owner", verified: true },
    { role: "admin", verified: true },
    { role: "owner", verified: false },
  ];
  for (const [index, member] of members.entries()) {
    const id = randomUUID();
    const email = `${member.role}-${randomUUID().slice(0, 8)}@test.exapay.local`;
    if (index < 2) emails[member.role] = email;
    await withUser(db, id, (tx) =>
      tx.insert(users).values({ id, email, fullName: `${member.role} ${name}`, emailVerifiedAt: member.verified ? new Date() : null }),
    );
    await withTenant(db, { tenantId, userId: id }, async (tx) => {
      if (index === 0) await tx.insert(tenants).values({ id: tenantId, name });
      await tx.insert(memberships).values({ tenantId, userId: id, role: member.role });
    });
  }
  return { tenantId, emails };
}

// Tanggal bebas: hanya app_owner (lolos trigger guard_tenant_subscription)
async function setSubscription(tenantId: string, status: SubscriptionStatus, dates: { trialEndsAt?: Date; currentPeriodEndsAt?: Date } = {}): Promise<void> {
  await ownerDb.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.tenant_id', ${tenantId}, true)`);
    const values = { status, trialEndsAt: dates.trialEndsAt ?? null, currentPeriodEndsAt: dates.currentPeriodEndsAt ?? null };
    await tx.insert(tenantSubscriptions).values({ tenantId, ...values }).onConflictDoUpdate({ target: tenantSubscriptions.tenantId, set: values });
  });
}

function createProcessor(mailer: FakeMailer): BillingNoticeProcessor {
  const config = new ConfigService<Env, true>({ APP_WEB_URL: "https://app.exapay.test" });
  return new BillingNoticeProcessor(db, mailer, config, new BillingInvoices(db, mailer, config));
}

async function noticesOf(tenantId: string): Promise<string[]> {
  const rows = await withTenant(db, { tenantId, userId: null }, (tx) => tx.select({ kind: subscriptionNotices.kind }).from(subscriptionNotices));
  return rows.map((row) => row.kind).sort();
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

describe("BillingNoticeProcessor.notify", () => {
  it("H-7, H-3, H-1, awal tenggang, baca-saja — masing-masing sekali, hanya ke owner terverifikasi", async () => {
    const ws = await createWorkspace("Toko Pengingat");
    const trialEndsAt = new Date(Date.now() + 30 * DAY);
    await setSubscription(ws.tenantId, "trialing", { trialEndsAt });
    const mailer = new FakeMailer();
    const processor = createProcessor(mailer);
    const notifyAt = (daysFromEnd: number) => processor.notify({ tenantId: ws.tenantId }, new Date(trialEndsAt.getTime() + daysFromEnd * DAY));

    await notifyAt(-10);
    expect(mailer.sent).toHaveLength(0);

    await notifyAt(-7);
    await notifyAt(-6.5);
    expect(mailer.sent).toHaveLength(1);
    expect(mailer.sent[0]?.to).toBe(ws.emails.owner);
    expect(mailer.sent[0]?.subject).toBe("Trial Exapay Toko Pengingat berakhir dalam 7 hari");
    expect(mailer.sent[0]?.text).toContain("https://app.exapay.test/settings/billing");

    for (const day of [-3, -2, -1, -0.5, 0.5, 3, 7.5, 20]) await notifyAt(day);
    expect(mailer.sent.map((message) => message.subject)).toEqual([
      "Trial Exapay Toko Pengingat berakhir dalam 7 hari",
      "Trial Exapay Toko Pengingat berakhir dalam 3 hari",
      "Trial Exapay Toko Pengingat berakhir besok",
      expect.stringMatching(/^Masa trial Toko Pengingat telah berakhir — tenggang sampai /),
      "Toko Pengingat sekarang dalam mode baca-saja",
    ]);
    expect(await noticesOf(ws.tenantId)).toEqual(["grace_started", "read_only", "trial_h1", "trial_h3", "trial_h7"]);
  });

  it("worker mati lama → hanya tahap paling mendesak; trial diperpanjang → pengingat baru; gratis tidak pernah", async () => {
    const ws = await createWorkspace("Toko Lompat");
    const firstEnd = new Date(Date.now() + 30 * DAY);
    await setSubscription(ws.tenantId, "trialing", { trialEndsAt: firstEnd });
    const mailer = new FakeMailer();
    const processor = createProcessor(mailer);

    await processor.notify({ tenantId: ws.tenantId }, new Date(firstEnd.getTime() - 1 * DAY));
    expect(mailer.sent.map((message) => message.subject)).toEqual(["Trial Exapay Toko Lompat berakhir besok"]);

    // Perpanjangan trial (super-admin, feature 42) = akhir periode baru → H-7 dikirim lagi
    const extendedEnd = new Date(firstEnd.getTime() + 14 * DAY);
    await setSubscription(ws.tenantId, "trialing", { trialEndsAt: extendedEnd });
    await processor.notify({ tenantId: ws.tenantId }, new Date(extendedEnd.getTime() - 7 * DAY));
    expect(mailer.sent).toHaveLength(2);

    await setSubscription(ws.tenantId, "complimentary");
    await processor.notify({ tenantId: ws.tenantId }, new Date(extendedEnd.getTime() + 30 * DAY));
    expect(mailer.sent).toHaveLength(2);
  });

  it("email gagal → tahap tidak tercatat, dikirim saat dicoba ulang", async () => {
    const ws = await createWorkspace("Toko Gagal Kirim");
    const trialEndsAt = new Date(Date.now() + 30 * DAY);
    await setSubscription(ws.tenantId, "trialing", { trialEndsAt });
    const now = new Date(trialEndsAt.getTime() - 3 * DAY);

    class BrokenMailer extends FakeMailer {
      override async send(): Promise<void> {
        throw new Error("SMTP mati");
      }
    }
    await expect(createProcessor(new BrokenMailer()).notify({ tenantId: ws.tenantId }, now)).rejects.toThrow("SMTP mati");
    expect(await noticesOf(ws.tenantId)).toEqual([]);

    const mailer = new FakeMailer();
    await createProcessor(mailer).notify({ tenantId: ws.tenantId }, now);
    expect(mailer.sent).toHaveLength(1);
    expect(await noticesOf(ws.tenantId)).toEqual(["trial_h3"]);
  });
});

describe("subscription_notices", () => {
  it("isolasi tenant; app_user tanpa UPDATE/DELETE", async () => {
    const a = await createWorkspace("Toko Notice A");
    const b = await createWorkspace("Toko Notice B");
    await withTenant(db, { tenantId: a.tenantId, userId: null }, (tx) =>
      tx.insert(subscriptionNotices).values({ tenantId: a.tenantId, kind: "trial_h7", periodEndsAt: new Date(), recipientCount: 1 }),
    );

    expect(await noticesOf(b.tenantId)).toEqual([]);
    await expect(
      withTenant(db, { tenantId: b.tenantId, userId: null }, (tx) =>
        tx.insert(subscriptionNotices).values({ tenantId: a.tenantId, kind: "trial_h3", periodEndsAt: new Date(), recipientCount: 1 }),
      ),
    ).rejects.toThrow();
    await expect(withTenant(db, { tenantId: a.tenantId, userId: null }, (tx) => tx.update(subscriptionNotices).set({ recipientCount: 2 }))).rejects.toThrow();
    await expect(withTenant(db, { tenantId: a.tenantId, userId: null }, (tx) => tx.delete(subscriptionNotices))).rejects.toThrow();
    expect(await noticesOf(a.tenantId)).toEqual(["trial_h7"]);
  });
});

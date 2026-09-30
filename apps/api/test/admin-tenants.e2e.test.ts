import "reflect-metadata";
import { randomUUID } from "node:crypto";

import * as schema from "@exapay/db";
import { invitations, memberships, tenants, users } from "@exapay/db";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { hash } from "@node-rs/argon2";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it, vi } from "vitest";

import { AppModule } from "../src/app.module.js";
import { configureApp } from "../src/app.setup.js";
import { type Database, withTenant, withUser } from "../src/database/tenant-transaction.js";
import { EMAIL_TRANSPORT, type EmailMessage, type EmailTransport } from "../src/modules/email/email.service.js";

// Verifikasi feature 07 (API): panel super-admin + undangan pemilik. Email ditangkap transport palsu.

const PASSWORD = "password-admin-123";

let app: INestApplication;
let server: Parameters<typeof request>[0];
let pool: pg.Pool;
let db: Database;
const sent: EmailMessage[] = [];

const captureTransport: EmailTransport = {
  async send(message: EmailMessage): Promise<void> {
    sent.push(message);
  },
};

type Account = { id: string; email: string };
let superAdmin: Account;
let plainOwner: Account & { tenantId: string };

function uniqueEmail(prefix: string): string {
  return `${prefix}-${randomUUID().slice(0, 8)}@test.exapay.local`;
}

async function createVerifiedUser(email: string, fullName: string): Promise<Account> {
  const id = randomUUID();
  const passwordHash = await hash(PASSWORD);
  await withUser(db, id, (tx) => tx.insert(users).values({ id, email, fullName, passwordHash, emailVerifiedAt: new Date() }));
  return { id, email };
}

async function setSuperAdmin(userId: string, value: boolean): Promise<void> {
  const owner = new pg.Pool({ connectionString: inject("testOwnerDatabaseUrl") });
  try {
    await drizzle({ client: owner }).transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.user_id', ${userId}, true)`);
      await tx.update(users).set({ isSuperAdmin: value }).where(eq(users.id, userId));
    });
  } finally {
    await owner.end();
  }
}

async function login(email: string, password = PASSWORD): Promise<request.Response> {
  return request(server).post("/auth/login").send({ email, password, client: "mobile" });
}

async function tokenOf(email: string): Promise<string> {
  const res = await login(email);
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body.data.tokens.accessToken;
}

function inviteTokenFrom(message: EmailMessage | undefined): string {
  const match = message?.text.match(/\/invite\/([A-Za-z0-9_-]+)/);
  if (!match?.[1]) throw new Error(`email tidak berisi tautan undangan: ${message?.text ?? "(tidak ada email)"}`);
  return match[1];
}

async function createTenant(accessToken: string, body: { name: string; ownerFullName: string; ownerEmail: string }): Promise<string> {
  const res = await request(server).post("/admin/tenants").set("Authorization", `Bearer ${accessToken}`).send(body);
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body.data.id;
}

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: inject("testDatabaseUrl") });
  db = drizzle({ client: pool, schema });

  superAdmin = await createVerifiedUser(uniqueEmail("sa"), "Super Admin");
  await setSuperAdmin(superAdmin.id, true);

  const owner = await createVerifiedUser(uniqueEmail("owner-biasa"), "Owner Biasa");
  const tenantId = randomUUID();
  await withTenant(db, { tenantId, userId: owner.id }, async (tx) => {
    await tx.insert(tenants).values({ id: tenantId, name: "Toko Biasa" });
    await tx.insert(memberships).values({ tenantId, userId: owner.id, role: "owner" });
  });
  plainOwner = { ...owner, tenantId };

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(EMAIL_TRANSPORT).useValue(captureTransport).compile();
  app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();
  server = app.getHttpServer();
});

afterAll(async () => {
  await app?.close();
  await pool?.end();
});

beforeEach(() => {
  sent.length = 0;
});

describe("akses panel super-admin", () => {
  it("tanpa login 401, anggota tenant biasa 403", async () => {
    expect((await request(server).get("/admin/tenants")).status).toBe(401);
    const token = await tokenOf(plainOwner.email);
    const res = await request(server).get("/admin/tenants").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it("flag dicabut di database → ditolak walau token masih menyatakan super-admin", async () => {
    const other = await createVerifiedUser(uniqueEmail("sa-dicabut"), "SA Dicabut");
    await setSuperAdmin(other.id, true);
    const token = await tokenOf(other.email);
    expect((await request(server).get("/admin/tenants").set("Authorization", `Bearer ${token}`)).status).toBe(200);

    await setSuperAdmin(other.id, false);
    const res = await request(server).get("/admin/tenants").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it("validasi input & id tidak valid", async () => {
    const token = await tokenOf(superAdmin.email);
    const bad = await request(server)
      .post("/admin/tenants")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Usaha", ownerFullName: "Pemilik", ownerEmail: "bukan-email" });
    expect(bad.status).toBe(400);
    expect(bad.body.error).toBe("Format email tidak valid");

    const missing = await request(server).get("/admin/tenants/bukan-uuid").set("Authorization", `Bearer ${token}`);
    expect(missing.status).toBe(404);
    expect(missing.body.error).toBe("Tenant tidak ditemukan");
  });
});

describe("buat tenant + undang pemilik", () => {
  it("pemilik baru: undangan → buat akun → login sebagai owner", async () => {
    const token = await tokenOf(superAdmin.email);
    const ownerEmail = uniqueEmail("pemilik-baru");
    const tenantId = await createTenant(token, { name: "Konveksi Sari Jaya", ownerFullName: "Sari Wulandari", ownerEmail });

    await vi.waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]?.to).toBe(ownerEmail);
    expect(sent[0]?.subject).toBe("Undangan bergabung dengan Konveksi Sari Jaya di Exapay");
    const inviteToken = inviteTokenFrom(sent[0]);

    const pending = await request(server).get(`/admin/tenants/${tenantId}`).set("Authorization", `Bearer ${token}`);
    expect(pending.body.data).toMatchObject({
      name: "Konveksi Sari Jaya",
      status: "pending_owner",
      owner: { fullName: "Sari Wulandari", email: ownerEmail, state: "invited" },
      pendingInvitations: 1,
    });

    const preview = await request(server).post("/invitations/lookup").send({ token: inviteToken });
    expect(preview.status).toBe(200);
    expect(preview.body.data).toMatchObject({ tenantName: "Konveksi Sari Jaya", email: ownerEmail, role: "owner", accountExists: false, expired: false });

    // Akun baru wajib password
    expect((await request(server).post("/invitations/accept").send({ token: inviteToken })).status).toBe(400);
    const accepted = await request(server).post("/invitations/accept").send({ token: inviteToken, fullName: "Sari W.", password: PASSWORD });
    expect(accepted.status, JSON.stringify(accepted.body)).toBe(200);
    // Tautan sekali pakai
    expect((await request(server).post("/invitations/accept").send({ token: inviteToken, fullName: "Xavier", password: PASSWORD })).status).toBe(410);
    expect((await request(server).post("/invitations/lookup").send({ token: inviteToken })).status).toBe(410);

    const session = await login(ownerEmail);
    expect(session.status).toBe(200);
    expect(session.body.data.user).toMatchObject({ fullName: "Sari W.", isSuperAdmin: false });
    expect(session.body.data.activeTenant).toMatchObject({ tenantId, tenantName: "Konveksi Sari Jaya", role: "owner" });

    const active = await request(server).get(`/admin/tenants/${tenantId}`).set("Authorization", `Bearer ${token}`);
    expect(active.body.data).toMatchObject({ status: "active", owner: { state: "active" }, memberCounts: { owner: 1 }, pendingInvitations: 0 });

    const list = await request(server).get("/admin/tenants").query({ q: "sari jaya" }).set("Authorization", `Bearer ${token}`);
    expect(list.body.data.items.map((t: { id: string }) => t.id)).toContain(tenantId);
  });

  it("email yang sudah punya akun: cukup terima, password lama tetap", async () => {
    const token = await tokenOf(superAdmin.email);
    const tenantId = await createTenant(token, { name: "Cabang Baru", ownerFullName: "Owner Biasa", ownerEmail: plainOwner.email.toUpperCase() });
    await vi.waitFor(() => expect(sent).toHaveLength(1));
    const inviteToken = inviteTokenFrom(sent[0]);

    const preview = await request(server).post("/invitations/lookup").send({ token: inviteToken });
    expect(preview.body.data.accountExists).toBe(true);
    expect((await request(server).post("/invitations/accept").send({ token: inviteToken })).status).toBe(200);

    const session = await login(plainOwner.email);
    expect(session.status).toBe(200);
    expect(session.body.data.tenants.map((t: { tenantId: string }) => t.tenantId).sort()).toEqual([plainOwner.tenantId, tenantId].sort());
  });

  it("kirim ulang undangan: cooldown, tautan lama tidak berlaku, undangan kedaluwarsa ditolak", async () => {
    const token = await tokenOf(superAdmin.email);
    const tenantId = await createTenant(token, { name: "Bengkel Jaya", ownerFullName: "Agus", ownerEmail: uniqueEmail("agus") });
    await vi.waitFor(() => expect(sent).toHaveLength(1));
    const firstToken = inviteTokenFrom(sent[0]);

    const tooSoon = await request(server).post(`/admin/tenants/${tenantId}/resend-owner-invitation`).set("Authorization", `Bearer ${token}`);
    expect(tooSoon.status).toBe(429);

    // Mundurkan waktu undangan: sudah lewat cooldown dan kedaluwarsa
    await withTenant(db, { tenantId, userId: null }, (tx) =>
      tx
        .update(invitations)
        .set({ createdAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000), expiresAt: new Date(Date.now() - 60_000) })
        .where(eq(invitations.tenantId, tenantId)),
    );
    const expired = await request(server).post("/invitations/lookup").send({ token: firstToken });
    expect(expired.body.data.expired).toBe(true);
    expect((await request(server).post("/invitations/accept").send({ token: firstToken, fullName: "Agus", password: PASSWORD })).status).toBe(410);
    const detail = await request(server).get(`/admin/tenants/${tenantId}`).set("Authorization", `Bearer ${token}`);
    expect(detail.body.data.owner.state).toBe("invitation_expired");

    const resent = await request(server).post(`/admin/tenants/${tenantId}/resend-owner-invitation`).set("Authorization", `Bearer ${token}`);
    expect(resent.status).toBe(200);
    await vi.waitFor(() => expect(sent).toHaveLength(2));
    const secondToken = inviteTokenFrom(sent[1]);
    expect(secondToken).not.toBe(firstToken);
    expect((await request(server).post("/invitations/lookup").send({ token: firstToken })).status).toBe(410);
    expect((await request(server).post("/invitations/lookup").send({ token: secondToken })).body.data.expired).toBe(false);
  });
});

describe("nonaktifkan tenant", () => {
  it("login & refresh ditolak selama nonaktif, pulih setelah diaktifkan kembali", async () => {
    const saToken = await tokenOf(superAdmin.email);
    const owner = await createVerifiedUser(uniqueEmail("katering"), "Ani");
    const tenantId = randomUUID();
    await withTenant(db, { tenantId, userId: owner.id }, async (tx) => {
      await tx.insert(tenants).values({ id: tenantId, name: "Katering Bu Ani" });
      await tx.insert(memberships).values({ tenantId, userId: owner.id, role: "owner" });
    });
    const before = await login(owner.email);
    expect(before.status).toBe(200);
    const refreshToken: string = before.body.data.tokens.refreshToken;

    const res = await request(server).post(`/admin/tenants/${tenantId}/deactivate`).set("Authorization", `Bearer ${saToken}`);
    expect(res.status).toBe(200);
    // Idempoten
    expect((await request(server).post(`/admin/tenants/${tenantId}/deactivate`).set("Authorization", `Bearer ${saToken}`)).status).toBe(200);

    const denied = await login(owner.email);
    expect(denied.status).toBe(403);
    expect(denied.body).toMatchObject({ success: false, code: "TENANT_DEACTIVATED" });
    // Password salah tetap 401 — status tenant tidak bocor tanpa password
    expect((await login(owner.email, "password-salah-999")).status).toBe(401);
    expect((await request(server).post("/auth/refresh").send({ refreshToken, client: "mobile" })).status).toBe(401);

    const detail = await request(server).get(`/admin/tenants/${tenantId}`).set("Authorization", `Bearer ${saToken}`);
    expect(detail.body.data.status).toBe("deactivated");
    expect(detail.body.data.deactivatedAt).not.toBeNull();
    const filtered = await request(server).get("/admin/tenants").query({ status: "deactivated" }).set("Authorization", `Bearer ${saToken}`);
    expect(filtered.body.data.items.every((t: { status: string }) => t.status === "deactivated")).toBe(true);

    expect((await request(server).post(`/admin/tenants/${tenantId}/reactivate`).set("Authorization", `Bearer ${saToken}`)).status).toBe(200);
    expect((await login(owner.email)).status).toBe(200);
  });

  it("user dengan usaha lain yang masih aktif tetap bisa login, tanpa usaha nonaktif", async () => {
    const saToken = await tokenOf(superAdmin.email);
    const user = await createVerifiedUser(uniqueEmail("multi"), "Multi");
    const [activeId, deactivatedId] = [randomUUID(), randomUUID()];
    for (const [id, name] of [
      [activeId, "Usaha Aktif"],
      [deactivatedId, "Usaha Nonaktif"],
    ] as const) {
      await withTenant(db, { tenantId: id, userId: user.id }, async (tx) => {
        await tx.insert(tenants).values({ id, name });
        await tx.insert(memberships).values({ tenantId: id, userId: user.id, role: "admin" });
      });
    }
    await request(server).post(`/admin/tenants/${deactivatedId}/deactivate`).set("Authorization", `Bearer ${saToken}`);

    const session = await login(user.email);
    expect(session.status).toBe(200);
    expect(session.body.data.tenants.map((t: { tenantId: string }) => t.tenantId)).toEqual([activeId]);
    expect(session.body.data.activeTenant?.tenantId).toBe(activeId);
  });

  it("undangan ke tenant nonaktif tidak bisa dibuka", async () => {
    const saToken = await tokenOf(superAdmin.email);
    const tenantId = await createTenant(saToken, { name: "Laundry Kilat", ownerFullName: "Maya", ownerEmail: uniqueEmail("maya") });
    await vi.waitFor(() => expect(sent).toHaveLength(1));
    await request(server).post(`/admin/tenants/${tenantId}/deactivate`).set("Authorization", `Bearer ${saToken}`);
    expect((await request(server).post("/invitations/lookup").send({ token: inviteTokenFrom(sent[0]) })).status).toBe(410);
    const resend = await request(server).post(`/admin/tenants/${tenantId}/resend-owner-invitation`).set("Authorization", `Bearer ${saToken}`);
    expect(resend.status).toBe(409);
  });
});

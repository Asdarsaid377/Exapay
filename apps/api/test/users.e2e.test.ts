import "reflect-metadata";
import { randomUUID } from "node:crypto";

import * as schema from "@exapay/db";
import { auditLogs, invitations, memberships, tenants, users } from "@exapay/db";
import type { MembershipRole } from "@exapay/shared";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { hash } from "@node-rs/argon2";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it, vi } from "vitest";

import { AppModule } from "../src/app.module.js";
import { configureApp } from "../src/app.setup.js";
import { type Database, withTenant, withUser } from "../src/database/tenant-transaction.js";
import { EMAIL_TRANSPORT, type EmailMessage, type EmailTransport } from "../src/modules/email/email.service.js";

// Verifikasi feature 08 (API): undang pengguna dari usaha, terima, ubah peran, cabut akses, batalkan undangan.

const PASSWORD = "password-users-123";

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
type Workspace = { tenantId: string; owner: Account; admin: Account; atasan: Account; karyawan: Account };

function uniqueEmail(prefix: string): string {
  return `${prefix}-${randomUUID().slice(0, 8)}@test.exapay.local`;
}

async function createVerifiedUser(email: string, fullName: string): Promise<Account> {
  const id = randomUUID();
  const passwordHash = await hash(PASSWORD);
  await withUser(db, id, (tx) => tx.insert(users).values({ id, email, fullName, passwordHash, emailVerifiedAt: new Date() }));
  return { id, email };
}

async function addMember(tenantId: string, account: Account, role: MembershipRole): Promise<void> {
  await withTenant(db, { tenantId, userId: account.id }, (tx) => tx.insert(memberships).values({ tenantId, userId: account.id, role }));
}

async function createWorkspace(name: string): Promise<Workspace> {
  const tenantId = randomUUID();
  const owner = await createVerifiedUser(uniqueEmail("owner"), `Owner ${name}`);
  await withTenant(db, { tenantId, userId: owner.id }, async (tx) => {
    await tx.insert(tenants).values({ id: tenantId, name });
    await tx.insert(memberships).values({ tenantId, userId: owner.id, role: "owner" });
  });
  const admin = await createVerifiedUser(uniqueEmail("admin"), `Admin ${name}`);
  const atasan = await createVerifiedUser(uniqueEmail("atasan"), `Atasan ${name}`);
  const karyawan = await createVerifiedUser(uniqueEmail("karyawan"), `Karyawan ${name}`);
  await addMember(tenantId, admin, "admin");
  await addMember(tenantId, atasan, "atasan");
  await addMember(tenantId, karyawan, "karyawan");
  return { tenantId, owner, admin, atasan, karyawan };
}

async function login(email: string): Promise<request.Response> {
  return request(server).post("/auth/login").send({ email, password: PASSWORD, client: "mobile" });
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

type OverviewBody = {
  members: { membershipId: string; email: string; role: MembershipRole; isSelf: boolean; canManage: boolean }[];
  invitations: { id: string; email: string; role: MembershipRole; canManage: boolean; invitedByName: string | null }[];
  assignableRoles: MembershipRole[];
};

async function overview(token: string): Promise<OverviewBody> {
  const res = await request(server).get("/users").set("Authorization", `Bearer ${token}`);
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body.data;
}

function membershipOf(body: OverviewBody, email: string): string {
  const member = body.members.find((m) => m.email === email);
  if (!member) throw new Error(`anggota ${email} tidak ada di daftar`);
  return member.membershipId;
}

async function invite(token: string, body: { email: string; fullName: string; role: MembershipRole }): Promise<request.Response> {
  return request(server).post("/users/invitations").set("Authorization", `Bearer ${token}`).send(body);
}

// Mundurkan waktu undangan agar lewat cooldown kirim ulang
async function backdateInvitations(tenantId: string): Promise<void> {
  await withTenant(db, { tenantId, userId: null }, (tx) =>
    tx
      .update(invitations)
      .set({ createdAt: new Date(Date.now() - 5 * 60_000) })
      .where(eq(invitations.tenantId, tenantId)),
  );
}

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: inject("testDatabaseUrl") });
  db = drizzle({ client: pool, schema });

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

describe("akses & daftar pengguna", () => {
  it("atasan & karyawan 403; owner & admin melihat anggota usaha aktif saja", async () => {
    const ws = await createWorkspace("Toko Akses");
    const other = await createWorkspace("Toko Lain");
    // Owner juga anggota usaha lain → membership itu tidak boleh ikut terdaftar
    await addMember(other.tenantId, ws.admin, "karyawan");

    expect((await request(server).get("/users")).status).toBe(401);
    const atasanToken = await tokenOf(ws.atasan.email);
    const karyawanToken = await tokenOf(ws.karyawan.email);
    expect((await request(server).get("/users").set("Authorization", `Bearer ${atasanToken}`)).status).toBe(403);
    expect((await request(server).get("/users").set("Authorization", `Bearer ${karyawanToken}`)).status).toBe(403);

    const ownerView = await overview(await tokenOf(ws.owner.email));
    expect(ownerView.members.map((m) => m.email).sort()).toEqual([ws.owner.email, ws.admin.email, ws.atasan.email, ws.karyawan.email].sort());
    expect(ownerView.assignableRoles).toEqual(["owner", "admin", "atasan", "karyawan"]);
    expect(ownerView.members.find((m) => m.email === ws.owner.email)).toMatchObject({ isSelf: true, canManage: false });
    expect(ownerView.members.find((m) => m.email === ws.admin.email)).toMatchObject({ isSelf: false, canManage: true });

    // Admin tergabung di 2 usaha → pilih usaha dulu
    const adminLogin = await login(ws.admin.email);
    const switched = await request(server)
      .post("/auth/switch-tenant")
      .set("Authorization", `Bearer ${adminLogin.body.data.tokens.accessToken}`)
      .send({ tenantId: ws.tenantId, refreshToken: adminLogin.body.data.tokens.refreshToken, client: "mobile" });
    expect(switched.status, JSON.stringify(switched.body)).toBe(200);
    const adminView = await overview(switched.body.data.tokens.accessToken);
    expect(adminView.members).toHaveLength(4);
    expect(adminView.assignableRoles).toEqual(["atasan", "karyawan"]);
    expect(adminView.members.find((m) => m.email === ws.owner.email)?.canManage).toBe(false);
    expect(adminView.members.find((m) => m.email === ws.karyawan.email)?.canManage).toBe(true);
  });
});

describe("undang pengguna", () => {
  it("owner mengundang atasan & karyawan → terima → login dengan peran sesuai", async () => {
    const ws = await createWorkspace("Konveksi Undang");
    const token = await tokenOf(ws.owner.email);
    const atasanEmail = uniqueEmail("atasan-baru");
    const karyawanEmail = uniqueEmail("karyawan-baru");

    expect((await invite(token, { email: atasanEmail, fullName: "Budi Atasan", role: "atasan" })).status).toBe(201);
    expect((await invite(token, { email: karyawanEmail, fullName: "Rina Karyawan", role: "karyawan" })).status).toBe(201);
    await vi.waitFor(() => expect(sent).toHaveLength(2));
    expect(sent[0]?.subject).toBe("Undangan bergabung dengan Konveksi Undang di Exapay");

    const pending = await overview(token);
    expect(pending.invitations.map((i) => i.email).sort()).toEqual([atasanEmail, karyawanEmail].sort());
    expect(pending.invitations[0]?.invitedByName).toBe("Owner Konveksi Undang");

    for (const [message, fullName] of [
      [sent.find((m) => m.to === atasanEmail), "Budi Atasan"],
      [sent.find((m) => m.to === karyawanEmail), "Rina Karyawan"],
    ] as const) {
      const accepted = await request(server).post("/invitations/accept").send({ token: inviteTokenFrom(message), fullName, password: PASSWORD });
      expect(accepted.status, JSON.stringify(accepted.body)).toBe(200);
    }

    expect((await login(atasanEmail)).body.data.activeTenant).toMatchObject({ tenantId: ws.tenantId, role: "atasan" });
    expect((await login(karyawanEmail)).body.data.activeTenant).toMatchObject({ tenantId: ws.tenantId, role: "karyawan" });

    const after = await overview(token);
    expect(after.invitations).toHaveLength(0);
    expect(after.members.find((m) => m.email === atasanEmail)?.role).toBe("atasan");
  });

  it("admin hanya bisa mengundang atasan & karyawan; email anggota ditolak; validasi input", async () => {
    const ws = await createWorkspace("Toko Batas");
    const adminToken = await tokenOf(ws.admin.email);

    expect((await invite(adminToken, { email: uniqueEmail("x"), fullName: "Calon Admin", role: "admin" })).status).toBe(403);
    expect((await invite(adminToken, { email: uniqueEmail("x"), fullName: "Calon Owner", role: "owner" })).status).toBe(403);
    expect((await invite(adminToken, { email: uniqueEmail("x"), fullName: "Calon Karyawan", role: "karyawan" })).status).toBe(201);

    const member = await invite(adminToken, { email: ws.karyawan.email.toUpperCase(), fullName: "Duplikat", role: "karyawan" });
    expect(member.status).toBe(409);
    expect(member.body.error).toBe("Email ini sudah terdaftar sebagai pengguna usaha ini");

    const bad = await invite(adminToken, { email: "bukan-email", fullName: "A", role: "karyawan" });
    expect(bad.status).toBe(400);

    // Undangan owner yang dibuat pemilik tidak bisa ditimpa admin
    const ownerToken = await tokenOf(ws.owner.email);
    const ownerInvite = uniqueEmail("calon-owner");
    expect((await invite(ownerToken, { email: ownerInvite, fullName: "Calon Pemilik", role: "owner" })).status).toBe(201);
    await backdateInvitations(ws.tenantId);
    expect((await invite(adminToken, { email: ownerInvite, fullName: "Diturunkan", role: "karyawan" })).status).toBe(403);
    const adminView = await overview(adminToken);
    expect(adminView.invitations.find((i) => i.email === ownerInvite)?.canManage).toBe(false);
  });

  it("undang ulang email yang sama: cooldown, lalu menggantikan undangan lama", async () => {
    const ws = await createWorkspace("Toko Ulang");
    const token = await tokenOf(ws.owner.email);
    const email = uniqueEmail("ulang");

    expect((await invite(token, { email, fullName: "Sinta", role: "karyawan" })).status).toBe(201);
    expect((await invite(token, { email, fullName: "Sinta", role: "atasan" })).status).toBe(429);
    await vi.waitFor(() => expect(sent).toHaveLength(1));
    const firstToken = inviteTokenFrom(sent[0]);

    await backdateInvitations(ws.tenantId);
    expect((await invite(token, { email, fullName: "Sinta", role: "atasan" })).status).toBe(201);
    await vi.waitFor(() => expect(sent).toHaveLength(2));
    expect((await request(server).post("/invitations/lookup").send({ token: firstToken })).status).toBe(410);
    const preview = await request(server).post("/invitations/lookup").send({ token: inviteTokenFrom(sent[1]) });
    expect(preview.body.data.role).toBe("atasan");
    expect((await overview(token)).invitations).toHaveLength(1);
  });
});

describe("kirim ulang & batalkan undangan", () => {
  it("kirim ulang mengganti tautan; batalkan membuat tautan tidak berlaku", async () => {
    const ws = await createWorkspace("Toko Kelola Undangan");
    const token = await tokenOf(ws.admin.email);
    expect((await invite(token, { email: uniqueEmail("resend"), fullName: "Dewi", role: "karyawan" })).status).toBe(201);
    await vi.waitFor(() => expect(sent).toHaveLength(1));
    const firstToken = inviteTokenFrom(sent[0]);
    const [first] = (await overview(token)).invitations;
    if (!first) throw new Error("undangan tidak ada");

    expect((await request(server).post(`/users/invitations/${first.id}/resend`).set("Authorization", `Bearer ${token}`)).status).toBe(429);
    await backdateInvitations(ws.tenantId);
    expect((await request(server).post(`/users/invitations/${first.id}/resend`).set("Authorization", `Bearer ${token}`)).status).toBe(200);
    await vi.waitFor(() => expect(sent).toHaveLength(2));
    const secondToken = inviteTokenFrom(sent[1]);
    expect((await request(server).post("/invitations/lookup").send({ token: firstToken })).status).toBe(410);

    const [second] = (await overview(token)).invitations;
    if (!second) throw new Error("undangan tidak ada");
    // Id lama sudah diganti
    expect((await request(server).post(`/users/invitations/${first.id}/cancel`).set("Authorization", `Bearer ${token}`)).status).toBe(404);
    expect((await request(server).post(`/users/invitations/${second.id}/cancel`).set("Authorization", `Bearer ${token}`)).status).toBe(200);
    expect((await request(server).post("/invitations/lookup").send({ token: secondToken })).status).toBe(410);
    expect((await overview(token)).invitations).toHaveLength(0);

    const audit = await withTenant(db, { tenantId: ws.tenantId, userId: null }, (tx) =>
      tx.select({ action: auditLogs.action }).from(auditLogs).where(and(eq(auditLogs.tenantId, ws.tenantId), eq(auditLogs.entity, "invitation"))),
    );
    expect(audit.map((a) => a.action).sort()).toEqual(["cancel", "create", "resend"]);
  });

  it("undangan usaha lain tidak bisa disentuh", async () => {
    const a = await createWorkspace("Toko A");
    const b = await createWorkspace("Toko B");
    const tokenB = await tokenOf(b.owner.email);
    expect((await invite(tokenB, { email: uniqueEmail("b"), fullName: "Orang B", role: "karyawan" })).status).toBe(201);
    const [invitationB] = (await overview(tokenB)).invitations;
    if (!invitationB) throw new Error("undangan tidak ada");

    const tokenA = await tokenOf(a.owner.email);
    expect((await request(server).post(`/users/invitations/${invitationB.id}/cancel`).set("Authorization", `Bearer ${tokenA}`)).status).toBe(404);
    const memberB = membershipOf(await overview(tokenB), b.karyawan.email);
    expect((await request(server).post(`/users/${memberB}/revoke`).set("Authorization", `Bearer ${tokenA}`)).status).toBe(404);
    expect((await request(server).post("/users/bukan-uuid/revoke").set("Authorization", `Bearer ${tokenA}`)).status).toBe(404);
  });
});

describe("ubah peran & cabut akses", () => {
  it("owner mengubah peran; admin tidak bisa mengelola admin/owner; tidak ada yang mengubah dirinya sendiri", async () => {
    const ws = await createWorkspace("Toko Peran");
    const ownerToken = await tokenOf(ws.owner.email);
    const adminToken = await tokenOf(ws.admin.email);
    const view = await overview(ownerToken);

    const karyawanId = membershipOf(view, ws.karyawan.email);
    const role = (id: string, token: string, value: MembershipRole): Promise<request.Response> =>
      request(server).post(`/users/${id}/role`).set("Authorization", `Bearer ${token}`).send({ role: value });

    expect((await role(karyawanId, ownerToken, "atasan")).status).toBe(200);
    expect((await login(ws.karyawan.email)).body.data.activeTenant.role).toBe("atasan");

    expect((await role(karyawanId, adminToken, "admin")).status).toBe(403);
    expect((await role(membershipOf(view, ws.owner.email), adminToken, "karyawan")).status).toBe(403);
    expect((await role(membershipOf(view, ws.owner.email), ownerToken, "admin")).status).toBe(403);
    expect((await role(membershipOf(view, ws.admin.email), adminToken, "karyawan")).status).toBe(403);
    expect((await role(karyawanId, adminToken, "karyawan")).status).toBe(200);

    const audit = await withTenant(db, { tenantId: ws.tenantId, userId: null }, (tx) =>
      tx.select({ before: auditLogs.before, after: auditLogs.after }).from(auditLogs).where(eq(auditLogs.action, "change_role")),
    );
    expect(audit.map((a) => [a.before, a.after])).toContainEqual([
      { userId: ws.karyawan.id, role: "karyawan" },
      { userId: ws.karyawan.id, role: "atasan" },
    ]);
  });

  it("admin yang diturunkan langsung kehilangan akses walau access token masih berlaku", async () => {
    const ws = await createWorkspace("Toko Turun");
    const ownerToken = await tokenOf(ws.owner.email);
    const adminToken = await tokenOf(ws.admin.email);
    const adminId = membershipOf(await overview(ownerToken), ws.admin.email);

    expect((await request(server).post(`/users/${adminId}/role`).set("Authorization", `Bearer ${ownerToken}`).send({ role: "karyawan" })).status).toBe(200);
    expect((await request(server).get("/users").set("Authorization", `Bearer ${adminToken}`)).status).toBe(403);
    expect((await invite(adminToken, { email: uniqueEmail("x"), fullName: "Coba", role: "karyawan" })).status).toBe(403);
  });

  it("cabut akses: membership hilang, akun tetap ada, bisa diundang lagi", async () => {
    const ws = await createWorkspace("Toko Cabut");
    const ownerToken = await tokenOf(ws.owner.email);
    const karyawanId = membershipOf(await overview(ownerToken), ws.karyawan.email);

    expect((await request(server).post(`/users/${karyawanId}/revoke`).set("Authorization", `Bearer ${ownerToken}`)).status).toBe(200);
    const session = await login(ws.karyawan.email);
    expect(session.status).toBe(200);
    expect(session.body.data.tenants).toEqual([]);
    expect(session.body.data.activeTenant).toBeNull();
    expect((await overview(ownerToken)).members.map((m) => m.email)).not.toContain(ws.karyawan.email);

    expect((await invite(ownerToken, { email: ws.karyawan.email, fullName: "Kembali", role: "karyawan" })).status).toBe(201);
    await vi.waitFor(() => expect(sent).toHaveLength(1));
    const token = inviteTokenFrom(sent[0]);
    expect((await request(server).post("/invitations/lookup").send({ token })).body.data.accountExists).toBe(true);
    expect((await request(server).post("/invitations/accept").send({ token })).status).toBe(200);
    expect((await login(ws.karyawan.email)).body.data.activeTenant).toMatchObject({ tenantId: ws.tenantId, role: "karyawan" });
  });

  it("owner bisa mengelola owner lain; usaha tidak pernah tanpa pemilik", async () => {
    const ws = await createWorkspace("Toko Dua Pemilik");
    const secondOwner = await createVerifiedUser(uniqueEmail("owner2"), "Owner Kedua");
    await addMember(ws.tenantId, secondOwner, "owner");
    const ownerToken = await tokenOf(ws.owner.email);
    const view = await overview(ownerToken);

    const secondId = membershipOf(view, secondOwner.email);
    expect((await request(server).post(`/users/${secondId}/role`).set("Authorization", `Bearer ${ownerToken}`).send({ role: "admin" })).status).toBe(200);
    expect((await request(server).post(`/users/${secondId}/revoke`).set("Authorization", `Bearer ${ownerToken}`)).status).toBe(200);

    // Pemilik tunggal tidak bisa mencabut / menurunkan dirinya sendiri
    const selfId = membershipOf(view, ws.owner.email);
    expect((await request(server).post(`/users/${selfId}/revoke`).set("Authorization", `Bearer ${ownerToken}`)).status).toBe(403);
    expect((await overview(ownerToken)).members.filter((m) => m.role === "owner")).toHaveLength(1);
  });
});

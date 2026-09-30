import "reflect-metadata";
import { createHash, randomUUID } from "node:crypto";

import * as schema from "@exapay/db";
import { auditLogs, emailVerificationTokens, users } from "@exapay/db";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { hash } from "@node-rs/argon2";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it, vi } from "vitest";

import { AppModule } from "../src/app.module.js";
import { configureApp } from "../src/app.setup.js";
import { type Database, withTenant, withUser } from "../src/database/tenant-transaction.js";
import { EMAIL_TRANSPORT, type EmailMessage, type EmailTransport } from "../src/modules/email/email.service.js";

// Verifikasi feature 05 (API): signup owner + verifikasi email. Email ditangkap transport palsu.

const PASSWORD = "password-owner-123";

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

function uniqueEmail(prefix: string): string {
  return `${prefix}-${randomUUID().slice(0, 8)}@test.exapay.local`;
}

function signupBody(email: string): Record<string, string> {
  return { fullName: "Budi Santoso", companyName: "Warung Maju Jaya", email, password: PASSWORD };
}

function tokenFrom(message: EmailMessage | undefined): string {
  const match = message?.text.match(/verify-email\?token=([A-Za-z0-9_-]+)/);
  if (!match?.[1]) throw new Error(`email tidak berisi tautan verifikasi: ${message?.text ?? "(tidak ada email)"}`);
  return match[1];
}

async function signup(email: string): Promise<request.Response> {
  return request(server).post("/auth/signup").send(signupBody(email));
}

async function verify(token: string): Promise<request.Response> {
  return request(server).post("/auth/verify-email").send({ token });
}

async function login(email: string, password = PASSWORD): Promise<request.Response> {
  return request(server).post("/auth/login").send({ email, password, client: "mobile" });
}

// Pemilik token lewat fungsi lookup yang sama dengan API (tanpa konteks)
async function userIdOfToken(token: string): Promise<string> {
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const { rows } = await pool.query<{ user_id: string }>("select user_id from auth_find_email_verification($1)", [tokenHash]);
  const userId = rows[0]?.user_id;
  if (!userId) throw new Error("token verifikasi tidak ditemukan");
  return userId;
}

async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 50));
}

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: inject("testDatabaseUrl") });
  db = drizzle({ client: pool, schema });

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(EMAIL_TRANSPORT)
    .useValue(captureTransport)
    .compile();
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

describe("signup owner", () => {
  it("membuat akun + usaha + membership owner, lalu login baru bisa setelah verifikasi", async () => {
    const email = uniqueEmail("owner");
    const res = await signup(email);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: null });
    // Tidak membuat sesi
    expect(res.headers["set-cookie"]).toBeUndefined();

    await vi.waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]?.to).toBe(email);
    expect(sent[0]?.subject).toBe("Verifikasi email akun Exapay");
    expect(sent[0]?.text).toContain("http://localhost:3000/verify-email?token=");

    const before = await login(email);
    expect(before.status).toBe(403);
    expect(before.body.error).toContain("belum diverifikasi");
    expect(before.body.code).toBe("EMAIL_UNVERIFIED");
    // Password salah tetap 401 — status verifikasi tidak bocor tanpa password
    expect((await login(email, "password-salah-999")).status).toBe(401);

    expect((await verify(tokenFrom(sent[0]))).status).toBe(200);

    const after = await login(email);
    expect(after.status).toBe(200);
    const session = after.body.data;
    expect(session.user).toMatchObject({ email, fullName: "Budi Santoso", isSuperAdmin: false });
    expect(session.activeTenant).toMatchObject({ tenantName: "Warung Maju Jaya", role: "owner" });
    expect(session.tenants).toHaveLength(1);

    // Audit log pembuatan tenant tercatat di tenant tersebut
    const logs = await withTenant(db, { tenantId: session.activeTenant.tenantId, userId: session.user.id }, (tx) =>
      tx.select({ entity: auditLogs.entity, action: auditLogs.action, actor: auditLogs.actorUserId }).from(auditLogs),
    );
    expect(logs).toEqual([{ entity: "tenant", action: "signup", actor: session.user.id }]);
  });

  it("memvalidasi input", async () => {
    const res = await request(server)
      .post("/auth/signup")
      .send({ ...signupBody(uniqueEmail("valid")), companyName: "A" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Nama usaha minimal 2 karakter");

    const short = await request(server)
      .post("/auth/signup")
      .send({ ...signupBody(uniqueEmail("valid")), password: "123" });
    expect(short.status).toBe(400);
    expect(short.body.error).toBe("Password minimal 8 karakter");
  });

  it("email sudah terdaftar & terverifikasi: respons sama, tidak membuat usaha, kirim pemberitahuan sekali", async () => {
    const id = randomUUID();
    const email = uniqueEmail("terdaftar");
    const passwordHash = await hash("password-lama-123");
    await withUser(db, id, (tx) => tx.insert(users).values({ id, email, fullName: "Lama", passwordHash, emailVerifiedAt: new Date() }));

    const res = await signup(email.toUpperCase());
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: null });
    await vi.waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]?.subject).toBe("Email Anda sudah terdaftar di Exapay");

    // Pemberitahuan kedua ditahan cooldown
    expect((await signup(email)).status).toBe(200);
    await settle();
    expect(sent).toHaveLength(1);

    // Password lama tetap berlaku, tidak ada usaha baru
    const session = await login(email, "password-lama-123");
    expect(session.status).toBe(200);
    expect(session.body.data.tenants).toEqual([]);
    expect((await login(email)).status).toBe(401);
  });

  it("email terdaftar tapi belum terverifikasi: kirim ulang tautan (setelah cooldown), tautan lama tidak berlaku", async () => {
    const email = uniqueEmail("ulang");
    await signup(email);
    await vi.waitFor(() => expect(sent).toHaveLength(1));
    const firstToken = tokenFrom(sent[0]);

    // Dalam cooldown: tidak ada email baru
    await signup(email);
    await settle();
    expect(sent).toHaveLength(1);

    const userId = await userIdOfToken(firstToken);
    await withUser(db, userId, (tx) =>
      tx.update(emailVerificationTokens).set({ createdAt: new Date(Date.now() - 120_000) }).where(eq(emailVerificationTokens.userId, userId)),
    );

    await signup(email);
    await vi.waitFor(() => expect(sent).toHaveLength(2));
    const secondToken = tokenFrom(sent[1]);
    expect(secondToken).not.toBe(firstToken);

    expect((await verify(firstToken)).status).toBe(410);
    expect((await verify(secondToken)).status).toBe(200);
    expect((await login(email)).status).toBe(200);
  });
});

describe("verifikasi email", () => {
  it("idempoten untuk tautan yang sama; menolak token asal & kedaluwarsa", async () => {
    const email = uniqueEmail("verif");
    await signup(email);
    await vi.waitFor(() => expect(sent).toHaveLength(1));
    const token = tokenFrom(sent[0]);

    expect((await verify(token)).status).toBe(200);
    expect((await verify(token)).status).toBe(200);

    const bogus = await verify("asal-asalan");
    expect(bogus.status).toBe(410);
    expect(bogus.body).toEqual({ success: false, error: "Tautan verifikasi tidak valid atau sudah kedaluwarsa" });
  });

  it("menolak token kedaluwarsa", async () => {
    const email = uniqueEmail("kedaluwarsa");
    await signup(email);
    await vi.waitFor(() => expect(sent).toHaveLength(1));
    const token = tokenFrom(sent[0]);

    const userId = await userIdOfToken(token);
    await withUser(db, userId, (tx) =>
      tx.update(emailVerificationTokens).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(emailVerificationTokens.userId, userId)),
    );

    expect((await verify(token)).status).toBe(410);
    expect((await login(email)).status).toBe(403);
  });
});

describe("kirim ulang verifikasi", () => {
  it("selalu sukses; hanya mengirim untuk akun yang belum terverifikasi", async () => {
    const unknown = await request(server).post("/auth/resend-verification").send({ email: uniqueEmail("tidak-ada") });
    expect(unknown.status).toBe(200);
    expect(unknown.body).toEqual({ success: true, data: null });

    const id = randomUUID();
    const verifiedEmail = uniqueEmail("sudah");
    await withUser(db, id, (tx) => tx.insert(users).values({ id, email: verifiedEmail, fullName: "Sudah", emailVerifiedAt: new Date() }));
    expect((await request(server).post("/auth/resend-verification").send({ email: verifiedEmail })).status).toBe(200);
    await settle();
    expect(sent).toEqual([]);
  });

  it("token verifikasi hanya terbaca pemiliknya (RLS)", async () => {
    const email = uniqueEmail("rls");
    await signup(email);
    await vi.waitFor(() => expect(sent).toHaveLength(1));

    const foreign = await withUser(db, randomUUID(), (tx) => tx.select({ id: emailVerificationTokens.id }).from(emailVerificationTokens));
    expect(foreign).toEqual([]);
    const { rows } = await pool.query("select count(*)::int as count from email_verification_tokens");
    expect(rows[0]).toEqual({ count: 0 });
  });
});

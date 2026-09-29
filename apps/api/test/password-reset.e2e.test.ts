import "reflect-metadata";
import { randomUUID } from "node:crypto";

import * as schema from "@exapay/db";
import { passwordResetTokens, users } from "@exapay/db";
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
import { type Database, withUser } from "../src/database/tenant-transaction.js";
import { EMAIL_TRANSPORT, type EmailMessage, type EmailTransport } from "../src/modules/email/email.service.js";

// Verifikasi feature 04 (API): lupa & reset password. Email ditangkap transport palsu.

const OLD_PASSWORD = "password-lama-123";
const NEW_PASSWORD = "password-baru-456";

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

async function createUser(): Promise<{ id: string; email: string }> {
  const id = randomUUID();
  const email = `reset-${id.slice(0, 8)}@test.exapay.local`;
  const passwordHash = await hash(OLD_PASSWORD);
  await withUser(db, id, (tx) => tx.insert(users).values({ id, email, fullName: "Uji Reset", passwordHash }));
  return { id, email };
}

function tokenFrom(message: EmailMessage | undefined): string {
  const match = message?.text.match(/reset-password\?token=([A-Za-z0-9_-]+)/);
  if (!match?.[1]) throw new Error(`email tidak berisi tautan reset: ${message?.text ?? "(tidak ada email)"}`);
  return match[1];
}

async function requestReset(email: string): Promise<request.Response> {
  return request(server).post("/auth/forgot-password").send({ email });
}

async function login(email: string, password: string): Promise<request.Response> {
  return request(server).post("/auth/login").send({ email, password, client: "mobile" });
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

describe("lupa password", () => {
  it("email tidak terdaftar: tetap sukses, tidak ada email", async () => {
    const res = await requestReset("tidak-terdaftar@test.exapay.local");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: null });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(sent).toEqual([]);
  });

  it("email terdaftar: mengirim tautan ke email tersebut; permintaan ulang < 60 detik tidak mengirim lagi", async () => {
    const user = await createUser();
    expect((await requestReset(user.email.toUpperCase())).status).toBe(200);
    await vi.waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]?.subject).toBe("Atur ulang password Exapay");
    expect(sent[0]?.text).toContain("http://localhost:3000/reset-password?token=");

    expect((await requestReset(user.email)).status).toBe(200);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(sent).toHaveLength(1);
  });

  it("memvalidasi format email", async () => {
    const res = await requestReset("bukan-email");
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Format email tidak valid");
  });
});

describe("reset password", () => {
  it("mengganti password, mengakhiri semua sesi, dan tautan hanya sekali pakai", async () => {
    const user = await createUser();
    const before = await login(user.email, OLD_PASSWORD);
    expect(before.status).toBe(200);
    const oldRefresh: unknown = before.body.data.tokens.refreshToken;

    await requestReset(user.email);
    await vi.waitFor(() => expect(sent).toHaveLength(1));
    const token = tokenFrom(sent[0]);

    const res = await request(server).post("/auth/reset-password").send({ token, password: NEW_PASSWORD });
    expect(res.status).toBe(200);

    expect((await login(user.email, OLD_PASSWORD)).status).toBe(401);
    expect((await login(user.email, NEW_PASSWORD)).status).toBe(200);
    // Sesi lama berakhir
    const refresh = await request(server).post("/auth/refresh").send({ refreshToken: oldRefresh, client: "mobile" });
    expect(refresh.status).toBe(401);

    const reuse = await request(server).post("/auth/reset-password").send({ token, password: "password-lain-789" });
    expect(reuse.status).toBe(410);
    expect(reuse.body).toEqual({ success: false, error: "Tautan reset tidak valid atau sudah kedaluwarsa" });
  });

  it("menolak token kedaluwarsa, token asal, dan password pendek", async () => {
    const user = await createUser();
    await requestReset(user.email);
    await vi.waitFor(() => expect(sent).toHaveLength(1));
    const token = tokenFrom(sent[0]);

    const short = await request(server).post("/auth/reset-password").send({ token, password: "123" });
    expect(short.status).toBe(400);
    expect(short.body.error).toBe("Password minimal 8 karakter");

    await withUser(db, user.id, (tx) =>
      tx.update(passwordResetTokens).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(passwordResetTokens.userId, user.id)),
    );
    expect((await request(server).post("/auth/reset-password").send({ token, password: NEW_PASSWORD })).status).toBe(410);
    expect((await request(server).post("/auth/reset-password").send({ token: "asal-asalan", password: NEW_PASSWORD })).status).toBe(410);
    // Password tidak berubah
    expect((await login(user.email, OLD_PASSWORD)).status).toBe(200);
  });

  it("token reset hanya terbaca pemiliknya (RLS)", async () => {
    const owner = await createUser();
    const other = await createUser();
    await requestReset(owner.email);
    await vi.waitFor(() => expect(sent).toHaveLength(1));

    const own = await withUser(db, owner.id, (tx) => tx.select({ id: passwordResetTokens.id }).from(passwordResetTokens));
    const foreign = await withUser(db, other.id, (tx) => tx.select({ id: passwordResetTokens.id }).from(passwordResetTokens));
    expect(own).toHaveLength(1);
    expect(foreign).toEqual([]);
  });
});

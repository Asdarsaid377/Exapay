import "reflect-metadata";
import { randomInt, randomUUID } from "node:crypto";

import * as schema from "@exapay/db";
import { users } from "@exapay/db";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { hash } from "@node-rs/argon2";
import { drizzle } from "drizzle-orm/node-postgres";
import { Redis } from "ioredis";
import pg from "pg";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";

import { AUTH_RATE_LIMITS } from "../src/modules/auth/auth-rate-limit.service.js";
import { type Database, withUser } from "../src/database/tenant-transaction.js";

// Verifikasi feature 38: rate limit login (per IP & per email), ganti password, dan endpoint pengirim email.
// IP klien disimulasikan lewat X-Forwarded-For dengan TRUST_PROXY_HOPS=1 (seperti di belakang Caddy di production).

const PASSWORD = "rahasia-yang-kuat-123";

let app: INestApplication;
let server: Parameters<typeof request>[0];
let pool: pg.Pool;
let db: Database;

async function createUser(): Promise<string> {
  const id = randomUUID();
  const email = `rate-${id.slice(0, 8)}@test.exapay.local`;
  const passwordHash = await hash(PASSWORD);
  await withUser(db, id, (tx) => tx.insert(users).values({ id, email, fullName: "Uji Rate Limit", passwordHash, emailVerifiedAt: new Date() }));
  return email;
}

// IP acak per skenario agar hitungan per IP tidak saling memengaruhi antar test
function randomIp(): string {
  return `10.${randomInt(256)}.${randomInt(256)}.${randomInt(1, 255)}`;
}

function login(email: string, password: string, ip: string, client: "web" | "mobile" = "web"): request.Test {
  return request(server).post("/auth/login").set("X-Forwarded-For", ip).send({ email, password, client });
}

beforeAll(async () => {
  // Harus di-set sebelum AppModule dievaluasi (ConfigModule.forRoot memvalidasi env saat import)
  process.env.TRUST_PROXY_HOPS = "1";
  const { AppModule } = await import("../src/app.module.js");
  const { configureApp } = await import("../src/app.setup.js");

  pool = new pg.Pool({ connectionString: inject("testDatabaseUrl") });
  db = drizzle({ client: pool, schema });

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();
  server = app.getHttpServer();
});

afterAll(async () => {
  await app?.close();
  await pool?.end();
});

describe("login", () => {
  it("per email: setelah batas gagal (dari IP mana pun), password benar pun ditolak 429; email lain tetap bisa", async () => {
    const email = await createUser();
    const other = await createUser();
    for (let i = 0; i < AUTH_RATE_LIMITS.loginFailuresPerEmail.limit; i++) {
      expect((await login(email, "salah-sekali", randomIp())).status).toBe(401);
    }

    const ip = randomIp();
    const blocked = await login(email, PASSWORD, ip);
    expect(blocked.status).toBe(429);
    expect(blocked.body).toEqual({ success: false, error: "Terlalu banyak percobaan login. Coba lagi dalam 15 menit." });
    expect(blocked.headers["set-cookie"]).toBeUndefined();

    expect((await login(other, PASSWORD, ip)).status).toBe(200);
  });

  it("login berhasil mereset hitungan gagal per email", async () => {
    const email = await createUser();
    const ip = randomIp();
    const almost = AUTH_RATE_LIMITS.loginFailuresPerEmail.limit - 1;
    for (let round = 0; round < 2; round++) {
      for (let i = 0; i < almost; i++) expect((await login(email, "salah-sekali", ip)).status).toBe(401);
      expect((await login(email, PASSWORD, ip)).status).toBe(200);
    }
  });

  it("per IP: setelah batas gagal (banyak email), IP itu tertahan; IP lain tidak", async () => {
    const email = await createUser();
    const ip = randomIp();
    for (let i = 0; i < AUTH_RATE_LIMITS.loginFailuresPerIp.limit; i++) {
      expect((await login(`tebak-${i}-${randomUUID().slice(0, 6)}@test.exapay.local`, "salah", ip)).status).toBe(401);
    }

    expect((await login(email, PASSWORD, ip)).status).toBe(429);
    expect((await login(email, PASSWORD, randomIp())).status).toBe(200);
  });

  it("login benar tidak dihitung: banyak karyawan di satu IP tetap bisa masuk", async () => {
    const email = await createUser();
    const ip = randomIp();
    for (let i = 0; i < AUTH_RATE_LIMITS.loginFailuresPerIp.limit + 5; i++) {
      expect((await login(email, PASSWORD, ip, "mobile")).status).toBe(200);
    }
  });

  it("Redis hanya menyimpan hash, bukan email/IP mentah", async () => {
    const email = await createUser();
    const ip = randomIp();
    expect((await login(email, "salah-sekali", ip)).status).toBe(401);

    const redis = new Redis(String(process.env.REDIS_URL));
    try {
      const keys = await redis.keys("ratelimit:*");
      expect(keys.length).toBeGreaterThan(0);
      expect(keys.some((key) => key.includes(email) || key.includes(ip))).toBe(false);
    } finally {
      await redis.quit();
    }
  });
});

describe("ganti password", () => {
  it("setelah batas password lama salah, percobaan berikutnya ditolak 429", async () => {
    const email = await createUser();
    const tokens = (await login(email, PASSWORD, randomIp(), "mobile")).body.data.tokens;
    const auth = { Authorization: `Bearer ${String(tokens.accessToken)}` };
    const body = (currentPassword: string): Record<string, string> => ({ currentPassword, newPassword: "password-baru-yang-kuat-456" });

    for (let i = 0; i < AUTH_RATE_LIMITS.changePasswordFailuresPerUser.limit; i++) {
      expect((await request(server).post("/auth/change-password").set(auth).send(body("salah-sekali"))).status).toBe(400);
    }
    const blocked = await request(server).post("/auth/change-password").set(auth).send(body(PASSWORD));
    expect(blocked.status).toBe(429);
    expect(blocked.body.error).toBe("Terlalu banyak percobaan password salah. Coba lagi dalam 15 menit.");
  });
});

describe("endpoint pengirim email", () => {
  it("lupa password dibatasi per IP per jam; IP lain tidak terpengaruh", async () => {
    const ip = randomIp();
    const forgot = (from: string): request.Test =>
      request(server).post("/auth/forgot-password").set("X-Forwarded-For", from).send({ email: `lupa-${randomUUID().slice(0, 8)}@test.exapay.local` });

    for (let i = 0; i < AUTH_RATE_LIMITS.emailRequestsPerIp.limit; i++) expect((await forgot(ip)).status).toBe(200);
    const blocked = await forgot(ip);
    expect(blocked.status).toBe(429);
    expect(blocked.body.error).toBe("Terlalu banyak permintaan dari jaringan Anda. Coba lagi dalam 60 menit.");
    expect((await forgot(randomIp())).status).toBe(200);
  });
});

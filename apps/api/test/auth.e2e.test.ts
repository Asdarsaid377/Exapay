import "reflect-metadata";
import { randomUUID } from "node:crypto";

import * as schema from "@exapay/db";
import { memberships, refreshTokens, tenants, users } from "@exapay/db";
import type { MembershipRole } from "@exapay/shared";
import { Controller, Get, type INestApplication } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Test } from "@nestjs/testing";
import { hash } from "@node-rs/argon2";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";

import { AppModule } from "../src/app.module.js";
import { configureApp } from "../src/app.setup.js";
import type { AuthUser } from "../src/common/auth/auth-user.js";
import { CurrentUser } from "../src/common/auth/current-user.decorator.js";
import { Roles } from "../src/common/auth/roles.decorator.js";
import { type Database, withTenant, withUser } from "../src/database/tenant-transaction.js";

// Verifikasi feature 03: login/refresh/logout, guard autentikasi & peran, pemilihan tenant aktif.

// Endpoint uji — hanya ada di test, untuk memverifikasi JwtAuthGuard + RolesGuard global
@Controller("probe")
class ProbeController {
  @Get("me")
  me(@CurrentUser() user: AuthUser): AuthUser {
    return user;
  }

  @Get("owner-only")
  @Roles("owner")
  ownerOnly(): { ok: true } {
    return { ok: true };
  }

  @Get("admin-or-owner")
  @Roles("owner", "admin")
  adminOrOwner(): { ok: true } {
    return { ok: true };
  }
}

const PASSWORD = "rahasia-yang-kuat-123";

type SeedUser = { id: string; email: string };

let app: INestApplication;
let server: Parameters<typeof request>[0];
let pool: pg.Pool;
let db: Database;

// Multi tenant: owner di "Alfa", karyawan di "Beta"
let multi: SeedUser;
// Satu tenant: admin di "Gamma"
let single: SeedUser;
let superAdmin: SeedUser;
let tenantAlfa: string;
let tenantBeta: string;
let tenantGamma: string;

async function createUser(fullName: string): Promise<SeedUser> {
  const id = randomUUID();
  const email = `${fullName.toLowerCase().replace(/\s+/g, "-")}-${id.slice(0, 8)}@test.exapay.local`;
  const passwordHash = await hash(PASSWORD);
  await withUser(db, id, (tx) => tx.insert(users).values({ id, email, fullName, passwordHash, emailVerifiedAt: new Date() }));
  return { id, email };
}

async function createTenant(name: string, owner: SeedUser): Promise<string> {
  const tenantId = randomUUID();
  await withTenant(db, { tenantId, userId: owner.id }, async (tx) => {
    await tx.insert(tenants).values({ id: tenantId, name });
    await tx.insert(memberships).values({ tenantId, userId: owner.id, role: "owner" });
  });
  return tenantId;
}

async function addMember(tenantId: string, user: SeedUser, role: MembershipRole): Promise<void> {
  await withTenant(db, { tenantId, userId: null }, (tx) => tx.insert(memberships).values({ tenantId, userId: user.id, role }));
}

// Nilai header Set-Cookie untuk cookie tertentu
function setCookie(res: request.Response, name: string): string | undefined {
  const header: unknown = res.headers["set-cookie"];
  const cookies = Array.isArray(header) ? header.filter((c): c is string => typeof c === "string") : [];
  return cookies.find((c) => c.startsWith(`${name}=`));
}

type MobileTokens = { accessToken: string; refreshToken: string };

function tokensOf(res: request.Response): MobileTokens {
  const tokens: unknown = res.body?.data?.tokens;
  if (
    typeof tokens !== "object" ||
    tokens === null ||
    typeof Reflect.get(tokens, "accessToken") !== "string" ||
    typeof Reflect.get(tokens, "refreshToken") !== "string"
  ) {
    throw new Error(`respons tidak berisi token: ${JSON.stringify(res.body)}`);
  }
  return { accessToken: String(Reflect.get(tokens, "accessToken")), refreshToken: String(Reflect.get(tokens, "refreshToken")) };
}

async function mobileLogin(user: SeedUser): Promise<MobileTokens> {
  const res = await request(server).post("/auth/login").send({ email: user.email, password: PASSWORD, client: "mobile" });
  expect(res.status).toBe(200);
  return tokensOf(res);
}

function bearer(token: string): { Authorization: string } {
  return { Authorization: `Bearer ${token}` };
}

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: inject("testDatabaseUrl") });
  db = drizzle({ client: pool, schema });

  multi = await createUser("Multi Tenant");
  single = await createUser("Satu Tenant");
  superAdmin = await createUser("Super Admin");
  const gammaOwner = await createUser("Pemilik Gamma");

  tenantAlfa = await createTenant("Alfa", multi);
  tenantBeta = await createTenant("Beta", gammaOwner);
  tenantGamma = await createTenant("Gamma", gammaOwner);
  await addMember(tenantBeta, multi, "karyawan");
  await addMember(tenantGamma, single, "admin");

  // Flag super-admin hanya bisa di-set app_owner (trigger guard_super_admin_flag)
  const owner = new pg.Pool({ connectionString: inject("testOwnerDatabaseUrl") });
  try {
    await drizzle({ client: owner }).transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.user_id', ${superAdmin.id}, true)`);
      await tx.update(users).set({ isSuperAdmin: true }).where(eq(users.id, superAdmin.id));
    });
  } finally {
    await owner.end();
  }

  const moduleRef = await Test.createTestingModule({ imports: [AppModule], controllers: [ProbeController] }).compile();
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
  it("menolak password salah dan email tidak terdaftar dengan pesan yang sama", async () => {
    const wrongPassword = await request(server).post("/auth/login").send({ email: single.email, password: "salah" });
    const unknownEmail = await request(server).post("/auth/login").send({ email: "tidak-ada@test.exapay.local", password: PASSWORD });

    for (const res of [wrongPassword, unknownEmail]) {
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ success: false, error: "Email atau password salah" });
      expect(setCookie(res, "exapay_access")).toBeUndefined();
    }
  });

  it("memvalidasi input", async () => {
    const res = await request(server).post("/auth/login").send({ email: "bukan-email", password: "x" });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ success: false, error: "Format email tidak valid" });
  });

  it("web: token di cookie httpOnly, tidak di body; tenant tunggal otomatis aktif", async () => {
    const res = await request(server).post("/auth/login").send({ email: single.email.toUpperCase(), password: PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.data.tokens).toBeUndefined();
    expect(res.body.data.activeTenant).toEqual({ tenantId: tenantGamma, tenantName: "Gamma", role: "admin" });
    for (const name of ["exapay_access", "exapay_refresh"]) {
      const cookie = setCookie(res, name);
      expect(cookie, name).toBeDefined();
      expect(cookie).toMatch(/HttpOnly/);
      expect(cookie).toMatch(/SameSite=Lax/);
    }
  });

  it("multi tenant: belum ada tenant aktif, daftar tenant urut nama", async () => {
    const res = await request(server).post("/auth/login").send({ email: multi.email, password: PASSWORD, client: "mobile" });
    expect(res.status).toBe(200);
    expect(res.body.data.activeTenant).toBeNull();
    expect(res.body.data.tenants).toEqual([
      { tenantId: tenantAlfa, tenantName: "Alfa", role: "owner" },
      { tenantId: tenantBeta, tenantName: "Beta", role: "karyawan" },
    ]);
    expect(setCookie(res, "exapay_access")).toBeUndefined();
  });

  it("super-admin: flag ikut di sesi, tanpa tenant", async () => {
    const { accessToken } = await mobileLogin(superAdmin);
    const res = await request(server).get("/auth/me").set(bearer(accessToken));
    expect(res.status).toBe(200);
    expect(res.body.data.user.isSuperAdmin).toBe(true);
    expect(res.body.data.tenants).toEqual([]);
  });
});

describe("endpoint terproteksi", () => {
  it("menolak tanpa token, token rusak, secret salah, dan token kedaluwarsa", async () => {
    const jwt = app.get(JwtService);
    const secret = process.env.JWT_ACCESS_SECRET ?? "";
    const payload = { sub: single.id, tid: tenantGamma, role: "admin", sa: false };
    const wrongSecret = await jwt.signAsync(payload, { secret: "x".repeat(40), algorithm: "HS256" });
    const expired = await jwt.signAsync({ ...payload, exp: Math.floor(Date.now() / 1000) - 60 }, { secret, algorithm: "HS256" });

    const noToken = await request(server).get("/probe/me");
    expect(noToken.status).toBe(401);
    expect(noToken.body).toEqual({ success: false, error: "Silakan login terlebih dahulu" });

    for (const token of ["bukan.jwt.valid", wrongSecret, expired]) {
      const res = await request(server).get("/probe/me").set(bearer(token));
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    }
  });

  it("menerima cookie (web) dan Bearer (mobile)", async () => {
    const agent = request.agent(server);
    await agent.post("/auth/login").send({ email: single.email, password: PASSWORD }).expect(200);
    const viaCookie = await agent.get("/probe/me");
    expect(viaCookie.status).toBe(200);
    expect(viaCookie.body).toMatchObject({ userId: single.id, tenantId: tenantGamma, role: "admin", isSuperAdmin: false });

    const { accessToken } = await mobileLogin(single);
    const viaBearer = await request(server).get("/probe/me").set(bearer(accessToken));
    expect(viaBearer.status).toBe(200);
    expect(viaBearer.body.userId).toBe(single.id);
  });

  it("menolak peran yang salah", async () => {
    const { accessToken } = await mobileLogin(single); // admin di Gamma
    expect((await request(server).get("/probe/admin-or-owner").set(bearer(accessToken))).status).toBe(200);

    const forbidden = await request(server).get("/probe/owner-only").set(bearer(accessToken));
    expect(forbidden.status).toBe(403);
    expect(forbidden.body).toEqual({ success: false, error: "Anda tidak memiliki akses ke fitur ini" });
  });

  it("endpoint ber-@Roles menolak user yang belum memilih tenant", async () => {
    const { accessToken } = await mobileLogin(multi);
    const res = await request(server).get("/probe/owner-only").set(bearer(accessToken));
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("Pilih usaha terlebih dahulu");
  });

  it("/health tetap publik", async () => {
    const res = await request(server).get("/health");
    expect([200, 503]).toContain(res.status);
  });
});

describe("pilih tenant aktif", () => {
  it("peran mengikuti tenant yang dipilih", async () => {
    const login = await mobileLogin(multi);

    const toAlfa = await request(server)
      .post("/auth/switch-tenant")
      .set(bearer(login.accessToken))
      .send({ tenantId: tenantAlfa, refreshToken: login.refreshToken, client: "mobile" });
    expect(toAlfa.status).toBe(200);
    expect(toAlfa.body.data.activeTenant).toEqual({ tenantId: tenantAlfa, tenantName: "Alfa", role: "owner" });
    const alfa = tokensOf(toAlfa);
    expect((await request(server).get("/probe/owner-only").set(bearer(alfa.accessToken))).status).toBe(200);

    const toBeta = await request(server)
      .post("/auth/switch-tenant")
      .set(bearer(alfa.accessToken))
      .send({ tenantId: tenantBeta, refreshToken: alfa.refreshToken, client: "mobile" });
    expect(toBeta.status).toBe(200);
    const beta = tokensOf(toBeta);
    expect((await request(server).get("/probe/owner-only").set(bearer(beta.accessToken))).status).toBe(403);

    // Refresh mempertahankan tenant aktif
    const refreshed = await request(server).post("/auth/refresh").send({ refreshToken: beta.refreshToken, client: "mobile" });
    expect(refreshed.status).toBe(200);
    expect(refreshed.body.data.activeTenant).toEqual({ tenantId: tenantBeta, tenantName: "Beta", role: "karyawan" });
  });

  it("menolak tenant yang bukan milik user", async () => {
    const login = await mobileLogin(multi);
    const res = await request(server)
      .post("/auth/switch-tenant")
      .set(bearer(login.accessToken))
      .send({ tenantId: tenantGamma, refreshToken: login.refreshToken, client: "mobile" });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("Anda bukan anggota usaha tersebut");

    // Refresh token lama tidak ikut hangus karena transaksi di-rollback
    const stillValid = await request(server).post("/auth/refresh").send({ refreshToken: login.refreshToken, client: "mobile" });
    expect(stillValid.status).toBe(200);
  });

  it("menolak refresh token milik user lain", async () => {
    const mine = await mobileLogin(multi);
    const other = await mobileLogin(single);
    const res = await request(server)
      .post("/auth/switch-tenant")
      .set(bearer(mine.accessToken))
      .send({ tenantId: tenantAlfa, refreshToken: other.refreshToken, client: "mobile" });
    expect(res.status).toBe(401);
  });
});

describe("refresh token", () => {
  it("web: refresh lewat cookie memberi access token baru", async () => {
    const agent = request.agent(server);
    await agent.post("/auth/login").send({ email: single.email, password: PASSWORD }).expect(200);
    const res = await agent.post("/auth/refresh").send({});
    expect(res.status).toBe(200);
    expect(setCookie(res, "exapay_access")).toBeDefined();
    expect(setCookie(res, "exapay_refresh")).toBeDefined();
    expect((await agent.get("/probe/me")).status).toBe(200);
  });

  it("dirotasi; dipakai ulang dalam jendela toleransi (request paralel) tetap dilayani tanpa mencabut family", async () => {
    const login = await mobileLogin(single);
    const [first, parallel] = await Promise.all([
      request(server).post("/auth/refresh").send({ refreshToken: login.refreshToken, client: "mobile" }),
      request(server).post("/auth/refresh").send({ refreshToken: login.refreshToken, client: "mobile" }),
    ]);
    expect(first.status).toBe(200);
    expect(parallel.status).toBe(200);
    expect(tokensOf(first).refreshToken).not.toBe(login.refreshToken);

    for (const res of [first, parallel]) {
      const next = await request(server).post("/auth/refresh").send({ refreshToken: tokensOf(res).refreshToken, client: "mobile" });
      expect(next.status).toBe(200);
    }
  });

  it("dipakai ulang setelah jendela toleransi → seluruh family dicabut", async () => {
    const login = await mobileLogin(single);
    const first = await request(server).post("/auth/refresh").send({ refreshToken: login.refreshToken, client: "mobile" });
    const rotated = tokensOf(first);

    // Mundurkan waktu rotasi token lama ke luar jendela toleransi
    await withUser(db, single.id, (tx) =>
      tx.execute(sql`update refresh_tokens set rotated_at = now() - interval '5 minutes' where rotated_at is not null`),
    );

    const stolen = await request(server).post("/auth/refresh").send({ refreshToken: login.refreshToken, client: "mobile" });
    expect(stolen.status).toBe(401);

    const legit = await request(server).post("/auth/refresh").send({ refreshToken: rotated.refreshToken, client: "mobile" });
    expect(legit.status).toBe(401);
  });

  it("menolak refresh token kedaluwarsa, rusak, atau kosong", async () => {
    const login = await mobileLogin(single);
    await withUser(db, single.id, (tx) =>
      tx.update(refreshTokens).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(refreshTokens.userId, single.id)),
    );
    for (const refreshToken of [login.refreshToken, "rusak", undefined]) {
      const res = await request(server).post("/auth/refresh").send({ refreshToken, client: "mobile" });
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ success: false, error: "Sesi berakhir, silakan login kembali" });
    }
  });
});

describe("logout", () => {
  it("web: menghapus cookie dan mencabut refresh token", async () => {
    const agent = request.agent(server);
    const login = await agent.post("/auth/login").send({ email: single.email, password: PASSWORD }).expect(200);
    const refreshCookie = setCookie(login, "exapay_refresh")?.split(";")[0];

    const res = await agent.post("/auth/logout").send({});
    expect(res.status).toBe(200);
    expect(setCookie(res, "exapay_access")).toMatch(/Expires=Thu, 01 Jan 1970/);
    expect(setCookie(res, "exapay_refresh")).toMatch(/Expires=Thu, 01 Jan 1970/);

    expect((await agent.get("/probe/me")).status).toBe(401);
    const reuse = await request(server).post("/auth/refresh").set("Cookie", refreshCookie ?? "").send({});
    expect(reuse.status).toBe(401);
  });

  it("mobile: refresh token dicabut", async () => {
    const login = await mobileLogin(multi);
    expect((await request(server).post("/auth/logout").send({ refreshToken: login.refreshToken })).status).toBe(200);
    const res = await request(server).post("/auth/refresh").send({ refreshToken: login.refreshToken, client: "mobile" });
    expect(res.status).toBe(401);
  });
});

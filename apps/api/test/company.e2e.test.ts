import "reflect-metadata";
import { randomUUID } from "node:crypto";

import * as schema from "@exapay/db";
import { auditLogs, memberships, tenants, users } from "@exapay/db";
import type { MembershipRole } from "@exapay/shared";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { hash } from "@node-rs/argon2";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";

import { AppModule } from "../src/app.module.js";
import { configureApp } from "../src/app.setup.js";
import { type Database, withTenant, withUser } from "../src/database/tenant-transaction.js";

// Verifikasi feature 09 (API): profil usaha + referensi wilayah.

const PASSWORD = "password-company-123";

let app: INestApplication;
let server: Parameters<typeof request>[0];
let pool: pg.Pool;
let db: Database;

type Workspace = { tenantId: string; emails: Record<MembershipRole, string> };

function uniqueEmail(prefix: string): string {
  return `${prefix}-${randomUUID().slice(0, 8)}@test.exapay.local`;
}

async function createWorkspace(name: string): Promise<Workspace> {
  const tenantId = randomUUID();
  const passwordHash = await hash(PASSWORD);
  const emails: Record<MembershipRole, string> = {
    owner: uniqueEmail("owner"),
    admin: uniqueEmail("admin"),
    atasan: uniqueEmail("atasan"),
    karyawan: uniqueEmail("karyawan"),
  };
  for (const role of ["owner", "admin", "atasan", "karyawan"] as const) {
    const id = randomUUID();
    await withUser(db, id, (tx) => tx.insert(users).values({ id, email: emails[role], fullName: `${role} ${name}`, passwordHash, emailVerifiedAt: new Date() }));
    await withTenant(db, { tenantId, userId: id }, async (tx) => {
      if (role === "owner") await tx.insert(tenants).values({ id: tenantId, name });
      await tx.insert(memberships).values({ tenantId, userId: id, role });
    });
  }
  return { tenantId, emails };
}

async function tokenOf(email: string): Promise<string> {
  const res = await request(server).post("/auth/login").send({ email, password: PASSWORD, client: "mobile" });
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body.data.tokens.accessToken;
}

const VALID = { name: "Konveksi Sari Jaya", address: "Jl. Perintis Kemerdekaan No. 10", npwp: "01.234.567.8-901.000", regencyCode: "73.71", payday: 25 };

async function put(token: string, body: object): Promise<request.Response> {
  return request(server).put("/company").set("Authorization", `Bearer ${token}`).send(body);
}

beforeAll(async () => {
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

describe("referensi wilayah", () => {
  it("38 provinsi + 514 kabupaten/kota, wajib login", async () => {
    expect((await request(server).get("/regions")).status).toBe(401);
    const ws = await createWorkspace("Toko Wilayah");
    const token = await tokenOf(ws.emails.karyawan);
    const res = await request(server).get("/regions").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    const provinces: { code: string; name: string; regencies: { code: string; name: string }[] }[] = res.body.data;
    expect(provinces).toHaveLength(38);
    expect(provinces.reduce((sum, p) => sum + p.regencies.length, 0)).toBe(514);
    const sulsel = provinces.find((p) => p.code === "73");
    expect(sulsel?.name).toBe("Sulawesi Selatan");
    expect(sulsel?.regencies).toContainEqual({ code: "73.71", name: "Kota Makassar" });
  });
});

describe("profil usaha", () => {
  it("hanya owner & admin", async () => {
    const ws = await createWorkspace("Toko Akses Profil");
    for (const role of ["atasan", "karyawan"] as const) {
      const token = await tokenOf(ws.emails[role]);
      expect((await request(server).get("/company").set("Authorization", `Bearer ${token}`)).status).toBe(403);
      expect((await put(token, VALID)).status).toBe(403);
    }
    const adminToken = await tokenOf(ws.emails.admin);
    expect((await request(server).get("/company").set("Authorization", `Bearer ${adminToken}`)).status).toBe(200);
  });

  it("simpan & tampil kembali; NPWP dinormalisasi; audit hanya kolom yang berubah", async () => {
    const ws = await createWorkspace("Toko Profil");
    const token = await tokenOf(ws.emails.owner);

    const empty = await request(server).get("/company").set("Authorization", `Bearer ${token}`);
    expect(empty.body.data).toMatchObject({ name: "Toko Profil", address: null, npwp: null, regency: null, payday: null });

    const saved = await put(token, VALID);
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
    const expected = {
      name: "Konveksi Sari Jaya",
      address: "Jl. Perintis Kemerdekaan No. 10",
      npwp: "012345678901000",
      regency: { code: "73.71", name: "Kota Makassar", provinceCode: "73", provinceName: "Sulawesi Selatan" },
      payday: 25,
    };
    expect(saved.body.data).toMatchObject(expected);
    expect((await request(server).get("/company").set("Authorization", `Bearer ${token}`)).body.data).toMatchObject(expected);

    // Nama baru juga terlihat di sesi (tenant switcher)
    const me = await request(server).get("/auth/me").set("Authorization", `Bearer ${token}`);
    expect(me.body.data.activeTenant.tenantName).toBe("Konveksi Sari Jaya");

    // Admin mengosongkan alamat + ganti tanggal gajian
    const adminToken = await tokenOf(ws.emails.admin);
    const cleared = await put(adminToken, { ...VALID, address: "  ", npwp: "0123456789010000", payday: 1 });
    expect(cleared.status).toBe(200);
    expect(cleared.body.data).toMatchObject({ address: null, npwp: "0123456789010000", payday: 1 });

    // Tanpa perubahan → tidak ada audit baru
    expect((await put(adminToken, { ...VALID, address: null, npwp: "0123456789010000", payday: 1 })).status).toBe(200);

    const audit = await withTenant(db, { tenantId: ws.tenantId, userId: null }, (tx) =>
      tx
        .select({ before: auditLogs.before, after: auditLogs.after })
        .from(auditLogs)
        .where(and(eq(auditLogs.tenantId, ws.tenantId), eq(auditLogs.action, "update_profile")))
        .orderBy(auditLogs.createdAt),
    );
    expect(audit).toHaveLength(2);
    expect(audit[0]?.before).toEqual({ name: "Toko Profil", address: null, npwp: null, regencyCode: null, payday: null });
    expect(audit[1]).toEqual({
      before: { address: "Jl. Perintis Kemerdekaan No. 10", npwp: "012345678901000", payday: 25 },
      after: { address: null, npwp: "0123456789010000", payday: 1 },
    });
  });

  it("validasi input", async () => {
    const ws = await createWorkspace("Toko Validasi");
    const token = await tokenOf(ws.emails.owner);
    const cases: [object, string][] = [
      [{ ...VALID, npwp: "12345" }, "NPWP harus 15 atau 16 digit angka"],
      [{ ...VALID, npwp: "01.234.567.8-901.00A" }, "NPWP harus 15 atau 16 digit angka"],
      [{ ...VALID, payday: 32 }, "Tanggal gajian 1–31"],
      [{ ...VALID, payday: 0 }, "Tanggal gajian 1–31"],
      [{ ...VALID, regencyCode: "Makassar" }, "Pilih kota/kabupaten"],
      [{ ...VALID, regencyCode: "99.99" }, "Kota/kabupaten tidak dikenal"],
      [{ ...VALID, name: "A" }, "Nama usaha minimal 2 karakter"],
    ];
    for (const [body, message] of cases) {
      const res = await put(token, body);
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect(res.body.error).toBe(message);
    }
    // Kolom opsional boleh null
    expect((await put(token, { name: "Toko Validasi", address: null, npwp: null, regencyCode: null, payday: null })).status).toBe(200);
  });

  it("hanya profil usaha aktif yang terbaca & berubah", async () => {
    const a = await createWorkspace("Toko A Profil");
    const b = await createWorkspace("Toko B Profil");
    expect((await put(await tokenOf(a.emails.owner), VALID)).status).toBe(200);
    const bToken = await tokenOf(b.emails.owner);
    const bView = await request(server).get("/company").set("Authorization", `Bearer ${bToken}`);
    expect(bView.body.data).toMatchObject({ name: "Toko B Profil", npwp: null });
  });
});

import "reflect-metadata";
import { randomUUID } from "node:crypto";

import * as schema from "@exapay/db";
import { auditLogs, memberships, tenants, users } from "@exapay/db";
import type { MembershipRole } from "@exapay/shared";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { hash } from "@node-rs/argon2";
import { and, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";

import { AppModule } from "../src/app.module.js";
import { configureApp } from "../src/app.setup.js";
import { type Database, withTenant, withUser } from "../src/database/tenant-transaction.js";

// Verifikasi feature 10 (API): departemen & jabatan.

const PASSWORD = "password-org-123";

let app: INestApplication;
let server: Parameters<typeof request>[0];
let pool: pg.Pool;
let db: Database;

type Workspace = { tenantId: string; tokens: Record<MembershipRole, string> };

async function createWorkspace(name: string): Promise<Workspace> {
  const tenantId = randomUUID();
  const passwordHash = await hash(PASSWORD);
  const emails: Record<MembershipRole, string> = { owner: "", admin: "", atasan: "", karyawan: "" };
  for (const role of ["owner", "admin", "atasan", "karyawan"] as const) {
    const id = randomUUID();
    emails[role] = `${role}-${randomUUID().slice(0, 8)}@test.exapay.local`;
    await withUser(db, id, (tx) => tx.insert(users).values({ id, email: emails[role], fullName: `${role} ${name}`, passwordHash, emailVerifiedAt: new Date() }));
    await withTenant(db, { tenantId, userId: id }, async (tx) => {
      if (role === "owner") await tx.insert(tenants).values({ id: tenantId, name });
      await tx.insert(memberships).values({ tenantId, userId: id, role });
    });
  }
  const tokens: Record<MembershipRole, string> = { owner: "", admin: "", atasan: "", karyawan: "" };
  for (const role of ["owner", "admin", "atasan", "karyawan"] as const) {
    const res = await request(server).post("/auth/login").send({ email: emails[role], password: PASSWORD, client: "mobile" });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    tokens[role] = res.body.data.tokens.accessToken;
  }
  return { tenantId, tokens };
}

type OrgBody = { departments: { id: string; name: string }[]; positions: { id: string; name: string }[]; canManage: boolean };

async function overview(token: string): Promise<request.Response> {
  return request(server).get("/organization").set("Authorization", `Bearer ${token}`);
}

async function create(token: string, kind: string, name: string): Promise<request.Response> {
  return request(server).post(`/organization/${kind}`).set("Authorization", `Bearer ${token}`).send({ name });
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

describe("departemen & jabatan", () => {
  it("usaha baru kosong; atasan hanya melihat; karyawan ditolak", async () => {
    const ws = await createWorkspace("Toko Org Akses");
    const empty = await overview(ws.tokens.owner);
    expect(empty.status).toBe(200);
    expect(empty.body.data).toEqual({ departments: [], positions: [], canManage: true });

    const atasanView = await overview(ws.tokens.atasan);
    expect(atasanView.status).toBe(200);
    expect(atasanView.body.data.canManage).toBe(false);
    expect((await create(ws.tokens.atasan, "departments", "Produksi")).status).toBe(403);
    expect((await overview(ws.tokens.karyawan)).status).toBe(403);
    expect((await create(ws.tokens.admin, "departments", "Produksi")).status).toBe(201);
  });

  it("tambah, ubah, hapus + audit log", async () => {
    const ws = await createWorkspace("Toko Org CRUD");
    const token = ws.tokens.owner;

    const dept = await create(token, "departments", "  Produksi  ");
    expect(dept.status, JSON.stringify(dept.body)).toBe(201);
    expect(dept.body.data.name).toBe("Produksi");
    expect((await create(token, "departments", "Gudang")).status).toBe(201);
    const pos = await create(token, "positions", "Staf Produksi");
    expect(pos.status).toBe(201);

    const listed: OrgBody = (await overview(token)).body.data;
    expect(listed.departments.map((d) => d.name)).toEqual(["Gudang", "Produksi"]);
    expect(listed.positions.map((p) => p.name)).toEqual(["Staf Produksi"]);

    const renamed = await request(server)
      .put(`/organization/departments/${dept.body.data.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Produksi Jahit" });
    expect(renamed.status).toBe(200);
    expect(renamed.body.data.name).toBe("Produksi Jahit");

    const removed = await request(server).delete(`/organization/positions/${pos.body.data.id}`).set("Authorization", `Bearer ${token}`);
    expect(removed.status).toBe(200);
    expect(((await overview(token)).body.data as OrgBody).positions).toEqual([]);
    expect((await request(server).delete(`/organization/positions/${pos.body.data.id}`).set("Authorization", `Bearer ${token}`)).status).toBe(404);

    const audit = await withTenant(db, { tenantId: ws.tenantId, userId: null }, (tx) =>
      tx
        .select({ entity: auditLogs.entity, action: auditLogs.action, before: auditLogs.before, after: auditLogs.after })
        .from(auditLogs)
        .where(and(eq(auditLogs.tenantId, ws.tenantId), inArray(auditLogs.entity, ["department", "position"])))
        .orderBy(auditLogs.createdAt),
    );
    expect(audit).toEqual([
      { entity: "department", action: "create", before: null, after: { name: "Produksi" } },
      { entity: "department", action: "create", before: null, after: { name: "Gudang" } },
      { entity: "position", action: "create", before: null, after: { name: "Staf Produksi" } },
      { entity: "department", action: "rename", before: { name: "Produksi" }, after: { name: "Produksi Jahit" } },
      { entity: "position", action: "delete", before: { name: "Staf Produksi" }, after: null },
    ]);
  });

  it("nama unik per usaha (tidak peka huruf besar/kecil); usaha lain boleh sama", async () => {
    const a = await createWorkspace("Toko Org A");
    const b = await createWorkspace("Toko Org B");
    expect((await create(a.tokens.owner, "positions", "Kasir")).status).toBe(201);
    const dup = await create(a.tokens.owner, "positions", "KASIR");
    expect(dup.status).toBe(409);
    expect(dup.body.error).toBe("Jabatan dengan nama ini sudah ada");
    // Nama sama di tabel lain & usaha lain tidak bentrok
    expect((await create(a.tokens.owner, "departments", "Kasir")).status).toBe(201);
    expect((await create(b.tokens.owner, "positions", "Kasir")).status).toBe(201);

    const other = await create(a.tokens.owner, "positions", "Pramuniaga");
    const clash = await request(server)
      .put(`/organization/positions/${other.body.data.id}`)
      .set("Authorization", `Bearer ${a.tokens.owner}`)
      .send({ name: "kasir" });
    expect(clash.status).toBe(409);
  });

  it("validasi & isolasi antar usaha", async () => {
    const a = await createWorkspace("Toko Org Validasi A");
    const b = await createWorkspace("Toko Org Validasi B");
    const bad = await create(a.tokens.owner, "departments", "A");
    expect(bad.status).toBe(400);
    expect(bad.body.error).toBe("Nama minimal 2 karakter");
    expect((await create(a.tokens.owner, "divisions", "Produksi")).status).toBe(404);

    const dept = await create(b.tokens.owner, "departments", "Milik B");
    const id = dept.body.data.id;
    expect((await request(server).put(`/organization/departments/${id}`).set("Authorization", `Bearer ${a.tokens.owner}`).send({ name: "Diambil A" })).status).toBe(404);
    expect((await request(server).delete(`/organization/departments/${id}`).set("Authorization", `Bearer ${a.tokens.owner}`)).status).toBe(404);
    expect((await request(server).delete("/organization/departments/bukan-uuid").set("Authorization", `Bearer ${a.tokens.owner}`)).status).toBe(404);
    expect(((await overview(b.tokens.owner)).body.data as OrgBody).departments.map((d) => d.name)).toEqual(["Milik B"]);
    expect(((await overview(a.tokens.owner)).body.data as OrgBody).departments).toEqual([]);
  });
});

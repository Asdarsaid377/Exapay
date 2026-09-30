import "reflect-metadata";
import { randomUUID } from "node:crypto";

import * as schema from "@exapay/db";
import { auditLogs, departments, employees, leaveRequests, memberships, positions, tenants, users } from "@exapay/db";
import type { MembershipRole } from "@exapay/shared";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { hash } from "@node-rs/argon2";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, inject, it, vi } from "vitest";

import { AppModule } from "../src/app.module.js";
import { configureApp } from "../src/app.setup.js";
import { type Database, withTenant, withUser } from "../src/database/tenant-transaction.js";
import { seedTenantDefaults } from "../src/modules/tenants/tenant-defaults.js";

// Verifikasi feature 15 (API): karyawan mengajukan izin/sakit/cuti (+ lampiran di storage S3) → atasan/owner/admin memutuskan
// → hari izin tampil di ringkasan bulan karyawan. Butuh container storage (SeaweedFS) selain postgres/redis/mailpit.

const PASSWORD = "password-leave-123";
const ROLES = ["owner", "admin", "atasan", "karyawan"] as const;
// PNG 1×1 minimal (cukup untuk pemeriksaan magic bytes)
const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082", "hex");

let app: INestApplication;
let server: Parameters<typeof request>[0];
let pool: pg.Pool;
let db: Database;

type Workspace = {
  tenantId: string;
  userIds: Record<MembershipRole, string>;
  emails: Record<MembershipRole, string>;
  departmentId: string;
  positionId: string;
};

async function createWorkspace(name: string): Promise<Workspace> {
  const tenantId = randomUUID();
  const passwordHash = await hash(PASSWORD);
  const userIds: Record<MembershipRole, string> = { owner: "", admin: "", atasan: "", karyawan: "" };
  const emails: Record<MembershipRole, string> = { owner: "", admin: "", atasan: "", karyawan: "" };
  for (const role of ROLES) {
    const id = randomUUID();
    userIds[role] = id;
    emails[role] = `${role}-${randomUUID().slice(0, 8)}@test.exapay.local`;
    await withUser(db, id, (tx) => tx.insert(users).values({ id, email: emails[role], fullName: `${role} ${name}`, passwordHash, emailVerifiedAt: new Date() }));
    await withTenant(db, { tenantId, userId: id }, async (tx) => {
      if (role === "owner") {
        await tx.insert(tenants).values({ id: tenantId, name });
        await seedTenantDefaults(tx, { tenantId, userId: id });
      }
      await tx.insert(memberships).values({ tenantId, userId: id, role });
    });
  }
  const ids = await withTenant(db, { tenantId, userId: null }, async (tx) => {
    const [department] = await tx.insert(departments).values({ tenantId, name: "Operasional" }).returning({ id: departments.id });
    const [position] = await tx.insert(positions).values({ tenantId, name: "Barista" }).returning({ id: positions.id });
    if (!department || !position) throw new Error("gagal membuat departemen/jabatan");
    return { departmentId: department.id, positionId: position.id };
  });
  return { tenantId, userIds, emails, ...ids };
}

async function addEmployee(ws: Workspace, userId: string | null, supervisorId: string | null = null): Promise<string> {
  const id = randomUUID();
  await withTenant(db, { tenantId: ws.tenantId, userId: null }, (tx) =>
    tx.insert(employees).values({
      id,
      tenantId: ws.tenantId,
      fullName: `Karyawan ${id.slice(0, 6)}`,
      departmentId: ws.departmentId,
      positionId: ws.positionId,
      supervisorId,
      userId,
      joinDate: "2025-01-01",
      employmentStatus: "permanent",
      ptkpStatus: "TK/0",
    }),
  );
  return id;
}

async function tokenOf(ws: Workspace, role: MembershipRole): Promise<string> {
  const res = await request(server).post("/auth/login").send({ email: ws.emails[role], password: PASSWORD, client: "mobile" });
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body.data.tokens.accessToken;
}

function get(token: string, path: string): request.Test {
  return request(server).get(path).set("Authorization", `Bearer ${token}`);
}

function post(token: string, path: string, body: object): request.Test {
  return request(server).post(path).set("Authorization", `Bearer ${token}`).send(body);
}

type LeaveFields = { type: string; startDate: string; endDate: string; reason: string };

function submit(token: string, fields: LeaveFields, file?: { buffer: Buffer; filename: string; contentType: string }): request.Test {
  let req = request(server)
    .post("/attendance/me/leave-requests")
    .set("Authorization", `Bearer ${token}`)
    .field("type", fields.type)
    .field("startDate", fields.startDate)
    .field("endDate", fields.endDate)
    .field("reason", fields.reason);
  if (file) req = req.attach("attachment", file.buffer, { filename: file.filename, contentType: file.contentType });
  return req;
}

// Senin 5 Okt 2026, 09:00 WIB
function setNow(): void {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-05T02:00:00Z"));
}

// Selasa–Kamis
const TUE_THU = { startDate: "2026-10-06", endDate: "2026-10-08" };

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: inject("testDatabaseUrl") });
  db = drizzle({ client: pool, schema });
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();
  server = app.getHttpServer();
});

afterEach(() => {
  vi.useRealTimers();
});

afterAll(async () => {
  await app?.close();
  await pool?.end();
});

describe("pengajuan izin → persetujuan atasan", () => {
  it("karyawan mengajukan dengan lampiran, atasan menyetujui, hari izin masuk ringkasan bulan", async () => {
    setNow();
    const ws = await createWorkspace("Kopi Izin");
    const supervisorEmployee = await addEmployee(ws, ws.userIds.atasan);
    await addEmployee(ws, ws.userIds.karyawan, supervisorEmployee);
    const karyawan = await tokenOf(ws, "karyawan");
    const atasan = await tokenOf(ws, "atasan");
    const owner = await tokenOf(ws, "owner");

    const created = await submit(karyawan, { type: "sick", ...TUE_THU, reason: "Demam, istirahat dokter" }, { buffer: PNG, filename: "surat dokter.png", contentType: "image/png" });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    expect(created.body.data).toMatchObject({
      type: "sick",
      status: "pending",
      workingDays: 3,
      attachment: { name: "surat dokter.png", contentType: "image/png", size: PNG.length },
    });
    const id: string = created.body.data.id;

    const pending = await get(atasan, "/attendance/leave-requests?status=pending");
    expect(pending.status).toBe(200);
    expect(pending.body.data).toMatchObject({ total: 1, pendingCount: 1, scope: "subordinates" });
    expect(pending.body.data.items[0]).toMatchObject({ id, canDecide: true, workingDays: 3 });

    // Lampiran: pemilik, atasan langsung, owner — isi sama persis
    for (const token of [karyawan, atasan, owner]) {
      const file = await get(token, `/attendance/leave-requests/${id}/attachment`).buffer(true);
      expect(file.status).toBe(200);
      expect(file.headers["content-type"]).toBe("image/png");
      expect(Buffer.compare(file.body, PNG)).toBe(0);
    }

    const approved = await post(atasan, `/attendance/leave-requests/${id}/decision`, { decision: "approve" });
    expect(approved.status, JSON.stringify(approved.body)).toBe(200);
    // Sudah diputuskan → tidak bisa diputuskan / dibatalkan lagi
    expect((await post(owner, `/attendance/leave-requests/${id}/decision`, { decision: "reject", note: "Tidak jadi" })).status).toBe(409);
    expect((await post(karyawan, `/attendance/me/leave-requests/${id}/cancel`, {})).status).toBe(409);

    const mine = await get(karyawan, "/attendance/me/leave-requests?month=2026-10");
    expect(mine.status).toBe(200);
    expect(mine.body.data.summary).toEqual({ permit: 0, sick: 3, leave: 0 });
    expect(mine.body.data.leaveDays).toEqual([
      { date: "2026-10-06", type: "sick" },
      { date: "2026-10-07", type: "sick" },
      { date: "2026-10-08", type: "sick" },
    ]);
    expect(mine.body.data.requests[0]).toMatchObject({ id, status: "approved", decidedByName: "atasan Kopi Izin" });

    const audit = await withTenant(db, { tenantId: ws.tenantId, userId: null }, (tx) =>
      tx.select({ action: auditLogs.action, actor: auditLogs.actorUserId }).from(auditLogs).where(eq(auditLogs.entityId, id)),
    );
    expect(audit).toEqual([{ action: "approve", actor: ws.userIds.atasan }]);
  });

  it("tanggal beririsan ditolak selama pengajuan lama aktif; setelah dibatalkan boleh diajukan ulang", async () => {
    setNow();
    const ws = await createWorkspace("Kopi Irisan");
    await addEmployee(ws, ws.userIds.karyawan);
    const karyawan = await tokenOf(ws, "karyawan");

    const first = await submit(karyawan, { type: "leave", ...TUE_THU, reason: "Acara keluarga" });
    expect(first.status).toBe(201);
    const overlap = await submit(karyawan, { type: "permit", startDate: "2026-10-08", endDate: "2026-10-09", reason: "Urusan bank" });
    expect(overlap.status).toBe(409);
    expect(overlap.body.error).toContain("sudah tercakup");

    expect((await post(karyawan, `/attendance/me/leave-requests/${first.body.data.id}/cancel`, {})).status).toBe(200);
    expect((await submit(karyawan, { type: "permit", startDate: "2026-10-08", endDate: "2026-10-09", reason: "Urusan bank" })).status).toBe(201);
  });

  it("menolak wajib beralasan; alasan tampil ke karyawan", async () => {
    setNow();
    const ws = await createWorkspace("Kopi Tolak");
    await addEmployee(ws, ws.userIds.karyawan);
    const karyawan = await tokenOf(ws, "karyawan");
    const admin = await tokenOf(ws, "admin");
    const { id } = (await submit(karyawan, { type: "permit", ...TUE_THU, reason: "Mengurus KTP" })).body.data;

    expect((await post(admin, `/attendance/leave-requests/${id}/decision`, { decision: "reject" })).status).toBe(400);
    expect((await post(admin, `/attendance/leave-requests/${id}/decision`, { decision: "reject", note: "Stok opname minggu ini" })).status).toBe(200);
    const mine = await get(karyawan, "/attendance/me/leave-requests?month=2026-10");
    expect(mine.body.data.requests[0]).toMatchObject({ status: "rejected", decisionNote: "Stok opname minggu ini", decidedByName: "admin Kopi Tolak" });
    expect(mine.body.data.summary).toEqual({ permit: 0, sick: 0, leave: 0 });
  });
});

describe("cakupan & wewenang", () => {
  it("atasan hanya bawahan langsung; karyawan tidak bisa membuka halaman persetujuan", async () => {
    setNow();
    const ws = await createWorkspace("Kopi Cakupan");
    await addEmployee(ws, ws.userIds.atasan);
    // Karyawan tanpa atasan — hanya owner/admin yang bisa memutuskan
    await addEmployee(ws, ws.userIds.karyawan);
    const karyawan = await tokenOf(ws, "karyawan");
    const atasan = await tokenOf(ws, "atasan");
    const { id } = (await submit(karyawan, { type: "permit", ...TUE_THU, reason: "Mengurus KTP" }, { buffer: PNG, filename: "ktp.png", contentType: "image/png" })).body
      .data;

    expect((await get(atasan, "/attendance/leave-requests")).body.data).toMatchObject({ total: 0, pendingCount: 0 });
    expect((await post(atasan, `/attendance/leave-requests/${id}/decision`, { decision: "approve" })).status).toBe(404);
    expect((await get(atasan, `/attendance/leave-requests/${id}/attachment`)).status).toBe(404);
    expect((await get(karyawan, "/attendance/leave-requests")).status).toBe(403);
    expect((await post(karyawan, `/attendance/leave-requests/${id}/decision`, { decision: "approve" })).status).toBe(403);
  });

  it("tidak ada yang memutuskan pengajuan miliknya sendiri", async () => {
    setNow();
    const ws = await createWorkspace("Kopi Sendiri");
    await addEmployee(ws, ws.userIds.owner);
    const owner = await tokenOf(ws, "owner");
    const admin = await tokenOf(ws, "admin");
    const { id } = (await submit(owner, { type: "leave", ...TUE_THU, reason: "Cuti tahunan" })).body.data;

    const list = await get(owner, "/attendance/leave-requests");
    expect(list.body.data.items[0]).toMatchObject({ id, canDecide: false });
    expect((await post(owner, `/attendance/leave-requests/${id}/decision`, { decision: "approve" })).status).toBe(403);
    expect((await get(admin, "/attendance/leave-requests")).body.data.items[0]).toMatchObject({ id, canDecide: true });
    expect((await post(admin, `/attendance/leave-requests/${id}/decision`, { decision: "approve" })).status).toBe(200);
  });
});

describe("validasi pengajuan", () => {
  it("menolak rentang tanpa hari kerja, lampiran bukan PDF/JPG/PNG, tanggal terbalik, akun tanpa data karyawan", async () => {
    setNow();
    const ws = await createWorkspace("Kopi Validasi");
    await addEmployee(ws, ws.userIds.karyawan);
    const karyawan = await tokenOf(ws, "karyawan");
    const admin = await tokenOf(ws, "admin");

    const weekend = await submit(karyawan, { type: "permit", startDate: "2026-10-10", endDate: "2026-10-11", reason: "Acara" });
    expect(weekend.status).toBe(400);
    expect(weekend.body.error).toContain("tidak berisi hari kerja");

    const fake = await submit(karyawan, { type: "sick", ...TUE_THU, reason: "Demam tinggi" }, { buffer: Buffer.from("bukan gambar"), filename: "surat.png", contentType: "image/png" });
    expect(fake.status).toBe(400);
    expect(fake.body.error).toContain("PDF, JPG, atau PNG");

    expect((await submit(karyawan, { type: "sick", startDate: "2026-10-08", endDate: "2026-10-06", reason: "Demam tinggi" })).status).toBe(400);
    expect((await submit(karyawan, { type: "holiday", ...TUE_THU, reason: "Demam tinggi" })).status).toBe(400);
    // Admin tanpa data karyawan tertaut
    expect((await submit(admin, { type: "leave", ...TUE_THU, reason: "Cuti tahunan" })).status).toBe(403);

    const rows = await withTenant(db, { tenantId: ws.tenantId, userId: null }, (tx) => tx.select({ id: leaveRequests.id }).from(leaveRequests));
    expect(rows).toEqual([]);
  });
});

describe("isolasi tenant leave_requests", () => {
  it("baris tenant lain tidak terbaca & tidak bisa ditulis; tidak ada DELETE", async () => {
    const a = await createWorkspace("Kopi Isolasi Izin A");
    const b = await createWorkspace("Kopi Isolasi Izin B");
    const employeeA = await addEmployee(a, a.userIds.karyawan);
    const values = { employeeId: employeeA, type: "permit" as const, reason: "Uji", startDate: "2026-10-06", endDate: "2026-10-06" };
    await withTenant(db, { tenantId: a.tenantId, userId: null }, (tx) => tx.insert(leaveRequests).values({ tenantId: a.tenantId, ...values }));

    const seenFromB = await withTenant(db, { tenantId: b.tenantId, userId: null }, (tx) => tx.select({ id: leaveRequests.id }).from(leaveRequests));
    expect(seenFromB).toEqual([]);
    await expect(
      withTenant(db, { tenantId: b.tenantId, userId: null }, (tx) => tx.insert(leaveRequests).values({ tenantId: a.tenantId, ...values, startDate: "2026-10-07", endDate: "2026-10-07" })),
    ).rejects.toThrow();
    // Merujuk karyawan tenant lain (FK komposit)
    await expect(
      withTenant(db, { tenantId: b.tenantId, userId: null }, (tx) => tx.insert(leaveRequests).values({ tenantId: b.tenantId, ...values, startDate: "2026-10-07", endDate: "2026-10-07" })),
    ).rejects.toThrow();
    await expect(
      withTenant(db, { tenantId: a.tenantId, userId: null }, (tx) => tx.delete(leaveRequests).where(eq(leaveRequests.employeeId, employeeA))),
    ).rejects.toThrow();
  });
});

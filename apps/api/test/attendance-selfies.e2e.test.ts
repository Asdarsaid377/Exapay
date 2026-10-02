import "reflect-metadata";
import { randomBytes, randomUUID } from "node:crypto";

import * as schema from "@exapay/db";
import { attendanceRecords, auditLogs, departments, employees, memberships, positions, tenants, users } from "@exapay/db";
import { type MembershipRole, SELFIE_MAX_BYTES } from "@exapay/shared";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { hash } from "@node-rs/argon2";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, inject, it, vi } from "vitest";

import { AppModule } from "../src/app.module.js";
import { configureApp } from "../src/app.setup.js";
import { type Database, withTenant, withUser } from "../src/database/tenant-transaction.js";
import { FileStorage } from "../src/modules/storage/file-storage.js";
import { seedTenantDefaults } from "../src/modules/tenants/tenant-defaults.js";

// Verifikasi feature 45 (API): selfie wajib (default aktif) → absen tanpa foto ditolak, dengan foto diterima & bisa
// dibuka; dimatikan → absen tanpa foto diterima; akses foto (pemilik, atasan langsung, owner/admin); foto kedaluwarsa;
// pengaturan diaudit; isolasi tenant. Penghapusan file > 90 hari diuji di worker (attendance-selfie.test.ts).
// Jam dipalsukan dengan vi.setSystemTime (hanya Date) — token login ulang setelah jam digeser.

const PASSWORD = "password-selfie-123";
const ROLES = ["owner", "admin", "atasan", "karyawan"] as const;
const MAKASSAR = "73.71";

let app: INestApplication;
let server: Parameters<typeof request>[0];
let pool: pg.Pool;
let db: Database;
let storage: FileStorage;

type Workspace = {
  tenantId: string;
  emails: Record<MembershipRole, string>;
  departmentId: string;
  positionId: string;
  // atasan → bawahan karyawan; other = karyawan lain (bukan bawahan atasan) dengan akun admin
  employeeIds: { atasan: string; karyawan: string; other: string };
};

// Data karyawan dibuat tanpa menyebut selfieRequired → default kolom (aktif)
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
        await tx.insert(tenants).values({ id: tenantId, name, regencyCode: MAKASSAR });
        await seedTenantDefaults(tx, { tenantId, userId: id });
      }
      await tx.insert(memberships).values({ tenantId, userId: id, role });
    });
  }
  return withTenant(db, { tenantId, userId: null }, async (tx) => {
    const [department] = await tx.insert(departments).values({ tenantId, name: "Operasional" }).returning({ id: departments.id });
    const [position] = await tx.insert(positions).values({ tenantId, name: "Barista" }).returning({ id: positions.id });
    if (!department || !position) throw new Error("gagal membuat departemen/jabatan");
    const base = { tenantId, departmentId: department.id, positionId: position.id, joinDate: "2025-01-01", employmentStatus: "permanent" as const, ptkpStatus: "TK/0" as const };
    const employeeIds = { atasan: randomUUID(), karyawan: randomUUID(), other: randomUUID() };
    await tx.insert(employees).values([
      { ...base, id: employeeIds.atasan, fullName: `Atasan ${name}`, userId: userIds.atasan },
      { ...base, id: employeeIds.karyawan, fullName: `Dewi ${name}`, userId: userIds.karyawan, supervisorId: employeeIds.atasan },
      { ...base, id: employeeIds.other, fullName: `Maya ${name}`, userId: userIds.admin },
    ]);
    return { tenantId, emails, departmentId: department.id, positionId: position.id, employeeIds };
  });
}

async function tokenOf(ws: Workspace, role: MembershipRole): Promise<string> {
  const res = await request(server).post("/auth/login").send({ email: ws.emails[role], password: PASSWORD, client: "mobile" });
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body.data.tokens.accessToken;
}

const get = (token: string, path: string): request.Test => request(server).get(path).set("Authorization", `Bearer ${token}`);
const put = (token: string, path: string, body: object): request.Test => request(server).put(path).set("Authorization", `Bearer ${token}`).send(body);

function setNow(iso: string): void {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(iso));
}

// JPEG minimal: magic bytes + isi acak (server hanya memeriksa jenis dari isi file, tanpa pengenalan wajah)
function jpeg(size = 2_048): Buffer {
  return Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), randomBytes(size - 4)]);
}

// multipart: location (string JSON) + selfie opsional
function clockMultipart(token: string, kind: "check-in" | "check-out", selfie: Buffer | null, location: object | null = null): request.Test {
  let built = request(server).post(`/attendance/me/${kind}`).set("Authorization", `Bearer ${token}`).field("location", location ? JSON.stringify(location) : "");
  if (selfie) built = built.attach("selfie", selfie, { filename: "selfie.jpg", contentType: "image/jpeg" });
  return built;
}

async function binary(token: string, path: string): Promise<request.Response> {
  return get(token, path)
    .buffer(true)
    .parse((res, done) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => done(null, Buffer.concat(chunks)));
    });
}

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: inject("testDatabaseUrl") });
  db = drizzle({ client: pool, schema });
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();
  server = app.getHttpServer();
  storage = app.get(FileStorage);
});

afterEach(() => {
  vi.useRealTimers();
});

afterAll(async () => {
  await app?.close();
  await pool?.end();
});

describe("selfie wajib (default aktif)", () => {
  it("tanpa foto ditolak, dengan foto diterima & bisa dibuka pemilik, atasan langsung, owner/admin", async () => {
    const ws = await createWorkspace("Selfie Wajib");
    // Senin 5 Okt 2026 07:55 WITA
    setNow("2026-10-04T23:55:00Z");
    const karyawan = await tokenOf(ws, "karyawan");
    const today = await get(karyawan, "/attendance/me/today");
    expect(today.body.data).toMatchObject({ selfieRequired: true, record: null });

    // Tanpa foto (JSON maupun multipart) → 400, absen tidak tercatat
    const json = await request(server).post("/attendance/me/check-in").set("Authorization", `Bearer ${karyawan}`).send({ location: null });
    expect(json.status).toBe(400);
    expect(json.body.error).toContain("Selfie wajib");
    expect((await clockMultipart(karyawan, "check-in", null)).status).toBe(400);
    // Bukan foto / terlalu besar
    const text = await request(server)
      .post("/attendance/me/check-in")
      .set("Authorization", `Bearer ${karyawan}`)
      .field("location", "")
      .attach("selfie", Buffer.from("bukan foto"), { filename: "selfie.jpg", contentType: "image/jpeg" });
    expect(text.status).toBe(400);
    expect((await clockMultipart(karyawan, "check-in", jpeg(SELFIE_MAX_BYTES + 1))).status).toBe(413);
    expect((await get(karyawan, "/attendance/me/today")).body.data.record).toBeNull();

    // Dengan foto + lokasi (multipart) → diterima, jam = jam server
    const photoIn = jpeg();
    const checkIn = await clockMultipart(karyawan, "check-in", photoIn, { latitude: -5.15672, longitude: 119.43628, accuracy: 12 });
    expect(checkIn.status, JSON.stringify(checkIn.body)).toBe(200);
    expect(checkIn.body.data).toMatchObject({ checkInAt: "2026-10-04T23:55:00.000Z", checkInLocated: true, checkInSelfie: "available", checkOutSelfie: null });
    const recordId: string = checkIn.body.data.id;

    // Pulang tanpa foto ditolak; dengan foto diterima
    setNow("2026-10-05T09:05:00Z");
    const karyawanLater = await tokenOf(ws, "karyawan");
    expect((await clockMultipart(karyawanLater, "check-out", null)).status).toBe(400);
    const photoOut = jpeg(3_000);
    const checkOut = await clockMultipart(karyawanLater, "check-out", photoOut);
    expect(checkOut.status, JSON.stringify(checkOut.body)).toBe(200);
    expect(checkOut.body.data).toMatchObject({ checkInSelfie: "available", checkOutSelfie: "available" });

    // File di storage usaha: tenants/<tenant_id>/attendance-selfies/<id>/…
    const [keys] = await withTenant(db, { tenantId: ws.tenantId, userId: null }, (tx) =>
      tx
        .select({ inKey: attendanceRecords.checkInSelfieKey, outKey: attendanceRecords.checkOutSelfieKey, inType: attendanceRecords.checkInSelfieType })
        .from(attendanceRecords)
        .where(eq(attendanceRecords.id, recordId)),
    );
    expect(keys?.inKey).toMatch(new RegExp(`^tenants/${ws.tenantId}/attendance-selfies/${recordId}/check_in-.+\\.jpg$`));
    expect(keys?.outKey).toMatch(new RegExp(`^tenants/${ws.tenantId}/attendance-selfies/${recordId}/check_out-.+\\.jpg$`));
    expect(keys?.inType).toBe("image/jpeg");

    // Pemilik absen, atasan langsung, owner, admin → foto yang sama
    for (const role of ["karyawan", "atasan", "owner", "admin"] as const) {
      const token = await tokenOf(ws, role);
      const res = await binary(token, `/attendance/records/${recordId}/selfie/check_in`);
      expect(res.status, `${role} ${(res.body as Buffer).toString()}`).toBe(200);
      expect(res.headers["content-type"]).toBe("image/jpeg");
      expect(Buffer.compare(res.body as Buffer, photoIn), role).toBe(0);
    }
    const out = await binary(await tokenOf(ws, "owner"), `/attendance/records/${recordId}/selfie/check_out`);
    expect(Buffer.compare(out.body as Buffer, photoOut)).toBe(0);
    expect((await get(await tokenOf(ws, "owner"), `/attendance/records/${recordId}/selfie/lunch`)).status).toBe(404);

    // Rekap/koreksi (rincian harian) menampilkan selfie
    const days = await get(await tokenOf(ws, "owner"), `/attendance/recap/${ws.employeeIds.karyawan}?from=2026-10-05&to=2026-10-05`);
    expect(days.status, JSON.stringify(days.body)).toBe(200);
    expect(days.body.data.days[0].record).toMatchObject({ id: recordId, checkInSelfie: "available", checkOutSelfie: "available" });
    // Riwayat portal milik sendiri
    const history = await get(karyawanLater, "/attendance/me/history?month=2026-10");
    expect(history.body.data.records[0]).toMatchObject({ id: recordId, checkInSelfie: "available" });
  });

  it("atasan tidak bisa membuka foto di luar bawahannya; karyawan tidak bisa membuka foto orang lain", async () => {
    const ws = await createWorkspace("Selfie Akses");
    setNow("2026-10-04T23:55:00Z");
    // Admin (Maya, bukan bawahan atasan) absen dengan selfie
    const admin = await tokenOf(ws, "admin");
    const res = await clockMultipart(admin, "check-in", jpeg());
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const recordId: string = res.body.data.id;

    expect((await get(await tokenOf(ws, "atasan"), `/attendance/records/${recordId}/selfie/check_in`)).status).toBe(404);
    expect((await get(await tokenOf(ws, "karyawan"), `/attendance/records/${recordId}/selfie/check_in`)).status).toBe(404);
    expect((await get(await tokenOf(ws, "owner"), `/attendance/records/${recordId}/selfie/check_in`)).status).toBe(200);
    // Belum pulang → belum ada foto pulang
    expect((await get(await tokenOf(ws, "owner"), `/attendance/records/${recordId}/selfie/check_out`)).status).toBe(404);
    expect((await get(await tokenOf(ws, "owner"), `/attendance/records/${randomUUID()}/selfie/check_in`)).status).toBe(404);
  });

  it("foto yang sudah dihapus (> 90 hari) tampil sebagai kedaluwarsa, tidak bisa dibuka", async () => {
    const ws = await createWorkspace("Selfie Kedaluwarsa");
    setNow("2026-10-04T23:55:00Z");
    const res = await clockMultipart(await tokenOf(ws, "karyawan"), "check-in", jpeg());
    const recordId: string = res.body.data.id;
    // Seperti hasil worker: file dihapus, key dikosongkan, jenis tetap
    const [row] = await withTenant(db, { tenantId: ws.tenantId, userId: null }, (tx) =>
      tx.select({ key: attendanceRecords.checkInSelfieKey }).from(attendanceRecords).where(eq(attendanceRecords.id, recordId)),
    );
    if (!row?.key) throw new Error("selfie tidak tersimpan");
    await storage.remove(row.key);
    await withTenant(db, { tenantId: ws.tenantId, userId: null }, (tx) =>
      tx.update(attendanceRecords).set({ checkInSelfieKey: null }).where(eq(attendanceRecords.id, recordId)),
    );

    const owner = await tokenOf(ws, "owner");
    const photo = await get(owner, `/attendance/records/${recordId}/selfie/check_in`);
    expect(photo.status).toBe(404);
    expect(photo.body.error).toContain("dihapus otomatis");
    const days = await get(owner, `/attendance/recap/${ws.employeeIds.karyawan}?from=2026-10-05&to=2026-10-05`);
    expect(days.body.data.days[0].record).toMatchObject({ checkInSelfie: "expired" });
  });
});

describe("pengaturan wajib selfie", () => {
  it("default aktif untuk karyawan baru; dimatikan owner/admin (audit) → absen tanpa foto diterima; atasan hanya baca", async () => {
    const ws = await createWorkspace("Selfie Pengaturan");
    const owner = await tokenOf(ws, "owner");

    // Karyawan baru lewat API → wajib selfie
    const created = await request(server)
      .post("/employees")
      .set("Authorization", `Bearer ${owner}`)
      .send({
        fullName: "Karyawan Baru",
        employeeNumber: null,
        email: null,
        phone: null,
        birthDate: null,
        gender: null,
        departmentId: ws.departmentId,
        positionId: ws.positionId,
        supervisorId: null,
        joinDate: "2025-01-06",
        employmentStatus: "permanent",
        contractEndDate: null,
        probationEndDate: null,
        nik: null,
        npwp: null,
        ptkpStatus: "TK/0",
        bankCode: null,
        bankAccountNumber: null,
        bankAccountHolder: null,
        userId: null,
      });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    expect((await get(owner, `/employees/${created.body.data.id}/attendance-settings`)).body.data).toMatchObject({ selfieRequired: true, canEdit: true });

    // Atasan: baca bawahan, tidak bisa mengubah
    const atasan = await tokenOf(ws, "atasan");
    expect((await get(atasan, `/employees/${ws.employeeIds.karyawan}/attendance-settings`)).body.data).toMatchObject({ selfieRequired: true, canEdit: false });
    expect((await put(atasan, `/employees/${ws.employeeIds.karyawan}/attendance-settings`, { locationMode: "all", selfieRequired: false })).status).toBe(403);

    // Lokasi diubah tanpa menyebut selfie → selfie tetap
    expect((await put(owner, `/employees/${ws.employeeIds.karyawan}/attendance-settings`, { locationMode: "exempt" })).body.data).toMatchObject({
      locationMode: "exempt",
      selfieRequired: true,
    });
    const admin = await tokenOf(ws, "admin");
    const off = await put(admin, `/employees/${ws.employeeIds.karyawan}/attendance-settings`, { locationMode: "exempt", selfieRequired: false });
    expect(off.status, JSON.stringify(off.body)).toBe(200);
    expect(off.body.data).toMatchObject({ selfieRequired: false });

    setNow("2026-10-04T23:55:00Z");
    const karyawan = await tokenOf(ws, "karyawan");
    expect((await get(karyawan, "/attendance/me/today")).body.data.selfieRequired).toBe(false);
    const res = await request(server).post("/attendance/me/check-in").set("Authorization", `Bearer ${karyawan}`).send({ location: null });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data).toMatchObject({ checkInSelfie: null, checkOutSelfie: null });
    expect((await get(await tokenOf(ws, "owner"), `/attendance/records/${res.body.data.id}/selfie/check_in`)).status).toBe(404);

    const audit = await withTenant(db, { tenantId: ws.tenantId, userId: null }, (tx) =>
      tx
        .select({ before: auditLogs.before, after: auditLogs.after })
        .from(auditLogs)
        .where(and(eq(auditLogs.entity, "employee"), eq(auditLogs.action, "update_attendance_settings"), eq(auditLogs.entityId, ws.employeeIds.karyawan))),
    );
    expect(audit).toEqual(
      expect.arrayContaining([
        {
          before: { locationMode: "exempt", locationIds: [], selfieRequired: true, scheduleMode: "business" },
          after: { locationMode: "exempt", locationIds: [], selfieRequired: false, scheduleMode: "business" },
        },
      ]),
    );
  });
});

describe("antrean tinjauan", () => {
  it("absen bertanda menyertakan status selfie", async () => {
    const ws = await createWorkspace("Selfie Tinjauan");
    const owner = await tokenOf(ws, "owner");
    const loc = await request(server)
      .post("/attendance/locations")
      .set("Authorization", `Bearer ${owner}`)
      .send({ name: "Kedai", address: null, latitude: -5.15672, longitude: 119.43628, radiusM: 100 });
    expect(loc.status).toBe(201);

    setNow("2026-10-04T23:55:00Z");
    // Izin lokasi ditolak → tanda "Tanpa lokasi", selfie tetap ada
    const res = await clockMultipart(await tokenOf(ws, "karyawan"), "check-in", jpeg(), null);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const reviews = await get(await tokenOf(ws, "owner"), "/attendance/reviews?month=2026-10");
    expect(reviews.body.data.items).toEqual([expect.objectContaining({ recordId: res.body.data.id, event: "check_in", selfie: "available" })]);
  });
});

describe("isolasi tenant", () => {
  it("foto usaha lain tidak bisa dibuka", async () => {
    const a = await createWorkspace("Selfie Iso A");
    const b = await createWorkspace("Selfie Iso B");
    setNow("2026-10-04T23:55:00Z");
    const res = await clockMultipart(await tokenOf(a, "karyawan"), "check-in", jpeg());
    const recordA: string = res.body.data.id;
    expect((await get(await tokenOf(b, "owner"), `/attendance/records/${recordA}/selfie/check_in`)).status).toBe(404);
    expect((await get(await tokenOf(b, "karyawan"), `/attendance/records/${recordA}/selfie/check_in`)).status).toBe(404);
    const fromB = await withTenant(db, { tenantId: b.tenantId, userId: null }, (tx) =>
      tx.select({ id: attendanceRecords.id }).from(attendanceRecords).where(eq(attendanceRecords.id, recordA)),
    );
    expect(fromB).toEqual([]);
  });
});

import "reflect-metadata";
import { randomUUID } from "node:crypto";

import * as schema from "@exapay/db";
import {
  attendanceRecords,
  attendanceReviews,
  auditLogs,
  departments,
  employees,
  employeeWorkLocations,
  memberships,
  positions,
  tenants,
  users,
  workLocations,
} from "@exapay/db";
import type { MembershipRole } from "@exapay/shared";
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
import { seedTenantDefaults } from "../src/modules/tenants/tenant-defaults.js";

// Verifikasi feature 44 (API): lokasi kerja, status geofence saat absen (snapshot), pengaturan lokasi per karyawan,
// antrean tinjauan (cakupan atasan, keputusan, audit), koreksi menghapus tanda, isolasi tenant.
// Jam dipalsukan dengan vi.setSystemTime (hanya Date) — token login ulang setelah jam digeser.

const PASSWORD = "password-geofence-123";
const ROLES = ["owner", "admin", "atasan", "karyawan"] as const;
const MAKASSAR = "73.71";

// 1° lintang = π/180 × 6.371.008,8 m
const METERS_PER_DEGREE = 111_194.93;
const KEDAI = { name: "Kedai Pettarani", address: "Jl. A. P. Pettarani No. 18", latitude: -5.15672, longitude: 119.43628, radiusM: 100 };
const GUDANG = { name: "Gudang Roasting Tamalanrea", address: null, latitude: -5.13241, longitude: 119.4881, radiusM: 150 };

// Titik `meters` ke utara dari pusat lokasi
function near(base: { latitude: number; longitude: number }, meters: number, accuracy: number | null): { latitude: number; longitude: number; accuracy: number | null } {
  return { latitude: base.latitude + meters / METERS_PER_DEGREE, longitude: base.longitude, accuracy };
}

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
  // Data karyawan per akun: atasan → bawahan karyawan; owner punya data karyawan sendiri; other = bukan bawahan atasan, tanpa akun
  employeeIds: { owner: string; atasan: string; karyawan: string; other: string };
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
    const base = { tenantId, departmentId: department.id, positionId: position.id, joinDate: "2025-01-01", employmentStatus: "permanent" as const, ptkpStatus: "TK/0" as const, selfieRequired: false };
    const employeeIds = { owner: randomUUID(), atasan: randomUUID(), karyawan: randomUUID(), other: randomUUID() };
    await tx.insert(employees).values([
      { ...base, id: employeeIds.owner, fullName: `Pemilik ${name}`, userId: userIds.owner },
      { ...base, id: employeeIds.atasan, fullName: `Atasan ${name}`, userId: userIds.atasan },
      { ...base, id: employeeIds.karyawan, fullName: `Dewi ${name}`, userId: userIds.karyawan, supervisorId: employeeIds.atasan },
      { ...base, id: employeeIds.other, fullName: `Maya ${name}` },
    ]);
    return { tenantId, userIds, emails, departmentId: department.id, positionId: position.id, employeeIds };
  });
}

async function tokenOf(ws: Workspace, role: MembershipRole): Promise<string> {
  const res = await request(server).post("/auth/login").send({ email: ws.emails[role], password: PASSWORD, client: "mobile" });
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body.data.tokens.accessToken;
}

const get = (token: string, path: string): request.Test => request(server).get(path).set("Authorization", `Bearer ${token}`);
const post = (token: string, path: string, body: object): request.Test => request(server).post(path).set("Authorization", `Bearer ${token}`).send(body);
const put = (token: string, path: string, body: object): request.Test => request(server).put(path).set("Authorization", `Bearer ${token}`).send(body);
const del = (token: string, path: string): request.Test => request(server).delete(path).set("Authorization", `Bearer ${token}`);

function setNow(iso: string): void {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(iso));
}

// Absen masuk/pulang karyawan pada jam tertentu (UTC) — login ulang karena jam digeser
async function clock(ws: Workspace, iso: string, kind: "check-in" | "check-out", location: ReturnType<typeof near> | null): Promise<request.Response> {
  setNow(iso);
  const token = await tokenOf(ws, "karyawan");
  return post(token, `/attendance/me/${kind}`, { location });
}

async function createLocation(token: string, input: typeof KEDAI | typeof GUDANG): Promise<string> {
  const res = await post(token, "/attendance/locations", input);
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body.data.id;
}

// Absen bertanda langsung di DB (karyawan tanpa akun / akun owner) — status geofence seperti hasil absen
async function insertFlagged(ws: Workspace, employeeId: string, workDate: string, checkInAt: string): Promise<string> {
  const [row] = await withTenant(db, { tenantId: ws.tenantId, userId: null }, (tx) =>
    tx
      .insert(attendanceRecords)
      .values({
        tenantId: ws.tenantId,
        employeeId,
        workDate,
        timeZone: "Asia/Makassar",
        scheduledStart: "08:00",
        scheduledEnd: "17:00",
        checkInAt: new Date(checkInAt),
        checkInGeofence: "no_location",
      })
      .returning({ id: attendanceRecords.id }),
  );
  if (!row) throw new Error("gagal membuat absen");
  return row.id;
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

afterEach(() => {
  vi.useRealTimers();
});

afterAll(async () => {
  await app?.close();
  await pool?.end();
});

describe("usaha tanpa lokasi kerja", () => {
  it("absen tidak dicek, portal tidak perlu meminta GPS, antrean kosong", async () => {
    const ws = await createWorkspace("Geo Tanpa Lokasi");
    // Senin 5 Okt 2026 07:55 WITA
    setNow("2026-10-04T23:55:00Z");
    const token = await tokenOf(ws, "karyawan");
    const today = await get(token, "/attendance/me/today");
    expect(today.body.data.locationCheck).toBe(false);

    const res = await post(token, "/attendance/me/check-in", { location: near(KEDAI, 5_000, 10) });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ status: "on_time", checkInLocated: true, checkInGeofence: null, checkOutGeofence: null });

    const owner = await tokenOf(ws, "owner");
    const reviews = await get(owner, "/attendance/reviews");
    expect(reviews.status).toBe(200);
    expect(reviews.body.data).toMatchObject({ items: [], total: 0, pendingCount: 0, hasLocations: false, timeZone: "Asia/Makassar" });
  });
});

describe("kelola lokasi kerja", () => {
  it("owner/admin menambah, mengubah, menghapus; validasi; atasan & karyawan ditolak; audit", async () => {
    const ws = await createWorkspace("Geo Kelola");
    const owner = await tokenOf(ws, "owner");
    const admin = await tokenOf(ws, "admin");
    const atasan = await tokenOf(ws, "atasan");
    const karyawan = await tokenOf(ws, "karyawan");

    const kedaiId = await createLocation(owner, KEDAI);
    const gudangId = await createLocation(admin, GUDANG);

    // Nama sama (beda huruf besar/kecil) ditolak; radius & koordinat di luar rentang ditolak
    expect((await post(owner, "/attendance/locations", { ...KEDAI, name: "kedai pettarani" })).status).toBe(409);
    expect((await post(owner, "/attendance/locations", { ...KEDAI, name: "Kecil", radiusM: 10 })).status).toBe(400);
    expect((await post(owner, "/attendance/locations", { ...KEDAI, name: "Jauh", radiusM: 1_001 })).status).toBe(400);
    expect((await post(owner, "/attendance/locations", { ...KEDAI, name: "Kutub", latitude: 91 })).status).toBe(400);

    for (const token of [atasan, karyawan]) {
      expect((await get(token, "/attendance/locations")).status).toBe(403);
      expect((await post(token, "/attendance/locations", { ...KEDAI, name: "Nyusup" })).status).toBe(403);
      expect((await del(token, `/attendance/locations/${kedaiId}`)).status).toBe(403);
    }

    const updated = await put(owner, `/attendance/locations/${kedaiId}`, { ...KEDAI, address: "", radiusM: 120 });
    expect(updated.status).toBe(200);
    expect(updated.body.data).toMatchObject({ id: kedaiId, address: null, radiusM: 120, selectedEmployeeCount: 0 });
    expect((await put(owner, `/attendance/locations/${randomUUID()}`, KEDAI)).status).toBe(404);
    expect((await put(owner, "/attendance/locations/bukan-uuid", KEDAI)).status).toBe(404);

    // Karyawan dikecualikan & lokasi tertentu tercermin di ringkasan
    expect((await put(owner, `/employees/${ws.employeeIds.other}/attendance-settings`, { locationMode: "exempt" })).status).toBe(200);
    expect((await put(owner, `/employees/${ws.employeeIds.atasan}/attendance-settings`, { locationMode: "selected", locationIds: [gudangId] })).status).toBe(200);
    const overview = await get(owner, "/attendance/locations");
    expect(overview.status).toBe(200);
    expect(overview.body.data.items.map((l: { name: string; selectedEmployeeCount: number }) => [l.name, l.selectedEmployeeCount])).toEqual([
      ["Gudang Roasting Tamalanrea", 1],
      ["Kedai Pettarani", 0],
    ]);
    expect(overview.body.data.employees).toEqual({ all: 2, selected: 1, exempt: 1 });

    expect((await del(owner, `/attendance/locations/${kedaiId}`)).status).toBe(200);
    expect((await del(owner, `/attendance/locations/${kedaiId}`)).status).toBe(404);

    const audit = await withTenant(db, { tenantId: ws.tenantId, userId: null }, (tx) =>
      tx.select({ action: auditLogs.action, entityId: auditLogs.entityId }).from(auditLogs).where(eq(auditLogs.entity, "work_location")),
    );
    expect(audit.filter((a) => a.entityId === kedaiId).map((a) => a.action).sort()).toEqual(["create", "delete", "update"]);
    expect(audit.filter((a) => a.entityId === gudangId).map((a) => a.action)).toEqual(["create"]);
  });
});

describe("status geofence saat absen", () => {
  it("inside, outside + jarak, no_location, inaccurate; dikecualikan & lokasi tertentu; snapshot tidak berubah", async () => {
    const ws = await createWorkspace("Geo Status");
    const owner = await tokenOf(ws, "owner");
    const kedaiId = await createLocation(owner, KEDAI);
    const gudangId = await createLocation(owner, GUDANG);

    // Senin 5 Okt: masuk 40 m dari Kedai (di dalam), pulang 320 m (di luar)
    setNow("2026-10-04T23:55:00Z");
    const today = await get(await tokenOf(ws, "karyawan"), "/attendance/me/today");
    expect(today.body.data.locationCheck).toBe(true);
    let res = await clock(ws, "2026-10-04T23:55:00Z", "check-in", near(KEDAI, 40, 12));
    expect(res.status).toBe(200);
    expect(res.body.data.checkInGeofence).toEqual({ status: "inside", distanceM: 40, locationName: "Kedai Pettarani", accuracyM: 12 });
    res = await clock(ws, "2026-10-05T09:05:00Z", "check-out", near(KEDAI, 320, 10));
    expect(res.body.data.checkOutGeofence).toEqual({ status: "outside", distanceM: 320, locationName: "Kedai Pettarani", accuracyM: 10 });

    // Selasa 6 Okt: masuk tanpa GPS, pulang dengan akurasi ±450 m
    res = await clock(ws, "2026-10-05T23:58:00Z", "check-in", null);
    expect(res.body.data.checkInGeofence).toEqual({ status: "no_location", distanceM: null, locationName: null, accuracyM: null });
    res = await clock(ws, "2026-10-06T09:00:00Z", "check-out", near(KEDAI, 30, 450));
    expect(res.body.data.checkOutGeofence).toEqual({ status: "inaccurate", distanceM: 30, locationName: "Kedai Pettarani", accuracyM: 450 });

    // Rabu 7 Okt: dikecualikan → tidak dicek walau 5 km dari lokasi, portal tidak meminta GPS
    setNow("2026-10-06T23:50:00Z");
    expect((await put(await tokenOf(ws, "owner"), `/employees/${ws.employeeIds.karyawan}/attendance-settings`, { locationMode: "exempt" })).status).toBe(200);
    expect((await get(await tokenOf(ws, "karyawan"), "/attendance/me/today")).body.data.locationCheck).toBe(false);
    res = await clock(ws, "2026-10-06T23:50:00Z", "check-in", near(KEDAI, 5_000, 10));
    expect(res.body.data).toMatchObject({ checkInLocated: true, checkInGeofence: null });

    // Kamis 8 Okt: hanya Gudang → absen di Kedai tercatat di luar lokasi Gudang (±6,3 km)
    const selected = await put(await tokenOf(ws, "owner"), `/employees/${ws.employeeIds.karyawan}/attendance-settings`, {
      locationMode: "selected",
      locationIds: [gudangId],
    });
    expect(selected.status).toBe(200);
    expect(selected.body.data).toMatchObject({ locationMode: "selected", locationIds: [gudangId], canEdit: true });
    res = await clock(ws, "2026-10-07T23:50:00Z", "check-in", near(KEDAI, 0, 10));
    expect(res.body.data.checkInGeofence).toMatchObject({ status: "outside", locationName: "Gudang Roasting Tamalanrea" });
    expect(res.body.data.checkInGeofence.distanceM).toBeGreaterThan(6_200);
    expect(res.body.data.checkInGeofence.distanceM).toBeLessThan(6_400);

    // Lokasi diubah belakangan (radius jadi 1 km, nama baru) → absen lama tetap snapshot
    setNow("2026-10-08T03:00:00Z");
    const ownerLater = await tokenOf(ws, "owner");
    expect((await put(ownerLater, `/attendance/locations/${kedaiId}`, { ...KEDAI, name: "Kedai Baru", radiusM: 1_000 })).status).toBe(200);
    const history = await get(await tokenOf(ws, "karyawan"), "/attendance/me/history?month=2026-10");
    expect(history.status, JSON.stringify(history.body)).toBe(200);
    const byDate = new Map(history.body.data.records.map((r: { workDate: string }) => [r.workDate, r]));
    expect(byDate.get("2026-10-05")).toMatchObject({
      checkInGeofence: { status: "inside", locationName: "Kedai Pettarani" },
      checkOutGeofence: { status: "outside", distanceM: 320, locationName: "Kedai Pettarani" },
    });
    expect(byDate.get("2026-10-07")).toMatchObject({ checkInGeofence: null });

    // Tanda tidak mengubah rekap (dasar potongan & gaji): 4 hari hadir, tanpa telat
    const recap = await get(ownerLater, "/attendance/recap?from=2026-10-05&to=2026-10-08");
    const row = recap.body.data.rows.find((r: { employee: { id: string } }) => r.employee.id === ws.employeeIds.karyawan);
    expect(row.summary).toMatchObject({ present: 4, late: 0, lateMinutes: 0 });

    // Pengaturan tercatat di audit
    const audit = await withTenant(db, { tenantId: ws.tenantId, userId: null }, (tx) =>
      tx
        .select({ before: auditLogs.before, after: auditLogs.after })
        .from(auditLogs)
        .where(and(eq(auditLogs.entity, "employee"), eq(auditLogs.action, "update_attendance_settings"), eq(auditLogs.entityId, ws.employeeIds.karyawan))),
    );
    expect(audit.map((a) => a.after)).toEqual(
      expect.arrayContaining([
        { locationMode: "exempt", locationIds: [], selfieRequired: false, scheduleMode: "business" },
        { locationMode: "selected", locationIds: [gudangId], selfieRequired: false, scheduleMode: "business" },
      ]),
    );
  });

  it("pengaturan per karyawan: atasan hanya baca bawahan langsung, validasi lokasi", async () => {
    const ws = await createWorkspace("Geo Pengaturan");
    const owner = await tokenOf(ws, "owner");
    const atasan = await tokenOf(ws, "atasan");
    const karyawan = await tokenOf(ws, "karyawan");

    const empty = await get(owner, `/employees/${ws.employeeIds.karyawan}/attendance-settings`);
    expect(empty.body.data).toEqual({ locationMode: "all", locationIds: [], locations: [], selfieRequired: false, scheduleMode: "business", hasShifts: false, canEdit: true });

    const kedaiId = await createLocation(owner, KEDAI);
    expect((await put(owner, `/employees/${ws.employeeIds.karyawan}/attendance-settings`, { locationMode: "selected", locationIds: [] })).status).toBe(400);
    expect((await put(owner, `/employees/${ws.employeeIds.karyawan}/attendance-settings`, { locationMode: "selected", locationIds: [randomUUID()] })).status).toBe(
      400,
    );
    expect((await put(owner, `/employees/${randomUUID()}/attendance-settings`, { locationMode: "all" })).status).toBe(404);

    const mine = await get(atasan, `/employees/${ws.employeeIds.karyawan}/attendance-settings`);
    expect(mine.status).toBe(200);
    expect(mine.body.data).toEqual({ locationMode: "all", locationIds: [], locations: [{ id: kedaiId, name: "Kedai Pettarani", radiusM: 100 }], selfieRequired: false, scheduleMode: "business", hasShifts: false, canEdit: false });
    expect((await get(atasan, `/employees/${ws.employeeIds.other}/attendance-settings`)).status).toBe(404);
    expect((await put(atasan, `/employees/${ws.employeeIds.karyawan}/attendance-settings`, { locationMode: "exempt" })).status).toBe(403);
    expect((await get(karyawan, `/employees/${ws.employeeIds.karyawan}/attendance-settings`)).status).toBe(403);
  });

  it("menghapus lokasi: absen lama tetap, karyawan yang kehilangan semua lokasinya kembali ke semua lokasi", async () => {
    const ws = await createWorkspace("Geo Hapus");
    const owner = await tokenOf(ws, "owner");
    await createLocation(owner, KEDAI);
    const gudangId = await createLocation(owner, GUDANG);
    await put(owner, `/employees/${ws.employeeIds.karyawan}/attendance-settings`, { locationMode: "selected", locationIds: [gudangId] });

    await clock(ws, "2026-10-04T23:55:00Z", "check-in", near(GUDANG, 400, 10));
    const ownerLater = await tokenOf(ws, "owner");
    expect((await del(ownerLater, `/attendance/locations/${gudangId}`)).status).toBe(200);

    const settings = await get(ownerLater, `/employees/${ws.employeeIds.karyawan}/attendance-settings`);
    expect(settings.body.data).toMatchObject({ locationMode: "all", locationIds: [] });
    const links = await withTenant(db, { tenantId: ws.tenantId, userId: null }, (tx) => tx.select().from(employeeWorkLocations));
    expect(links).toEqual([]);

    setNow("2026-10-05T03:00:00Z");
    const today = await get(await tokenOf(ws, "karyawan"), "/attendance/me/today");
    expect(today.body.data.record.checkInGeofence).toMatchObject({ status: "outside", distanceM: 400, locationName: "Gudang Roasting Tamalanrea" });

    const audit = await withTenant(db, { tenantId: ws.tenantId, userId: null }, (tx) =>
      tx
        .select({ after: auditLogs.after })
        .from(auditLogs)
        .where(and(eq(auditLogs.action, "update_attendance_settings"), eq(auditLogs.entityId, ws.employeeIds.karyawan))),
    );
    expect(audit.map((a) => a.after)).toContainEqual({ locationMode: "all", locationIds: [], reason: "work_location_deleted" });
  });
});

describe("tinjauan absen bertanda", () => {
  it("cakupan atasan, keputusan & ubah keputusan, catatan wajib tindak lanjut, absensi sendiri, audit", async () => {
    const ws = await createWorkspace("Geo Tinjau");
    const owner = await tokenOf(ws, "owner");
    await createLocation(owner, KEDAI);

    // Dewi (bawahan atasan): masuk di luar lokasi, pulang di dalam (tanpa tanda)
    const checkIn = await clock(ws, "2026-10-04T23:58:00Z", "check-in", near(KEDAI, 320, 10));
    const dewiRecordId: string = checkIn.body.data.id;
    await clock(ws, "2026-10-05T09:00:00Z", "check-out", near(KEDAI, 20, 10));
    // Maya (bukan bawahan atasan) & data karyawan milik owner: tanpa lokasi
    const mayaRecordId = await insertFlagged(ws, ws.employeeIds.other, "2026-10-06", "2026-10-06T00:11:00Z");
    const ownRecordId = await insertFlagged(ws, ws.employeeIds.owner, "2026-10-06", "2026-10-06T00:05:00Z");

    setNow("2026-10-06T03:00:00Z");
    const ownerToken = await tokenOf(ws, "owner");
    const atasanToken = await tokenOf(ws, "atasan");
    const karyawanToken = await tokenOf(ws, "karyawan");

    const all = await get(ownerToken, "/attendance/reviews");
    expect(all.status).toBe(200);
    expect(all.body.data).toMatchObject({ total: 3, pendingCount: 3, hasLocations: true });
    // Terbaru di atas; satu baris per absen bertanda (pulang Dewi di dalam lokasi tidak muncul)
    expect(all.body.data.items.map((i: { recordId: string; event: string; canReview: boolean }) => [i.recordId, i.event, i.canReview])).toEqual([
      [mayaRecordId, "check_in", true],
      [ownRecordId, "check_in", false],
      [dewiRecordId, "check_in", true],
    ]);
    expect(all.body.data.items[2]).toMatchObject({
      employee: { id: ws.employeeIds.karyawan, positionName: "Barista" },
      workDate: "2026-10-05",
      at: "2026-10-04T23:58:00.000Z",
      flag: { kind: "outside", distanceM: 320, locationName: "Kedai Pettarani", accuracyM: 10 },
      review: null,
    });

    const scoped = await get(atasanToken, "/attendance/reviews");
    expect(scoped.body.data.items.map((i: { recordId: string }) => i.recordId)).toEqual([dewiRecordId]);
    expect((await get(karyawanToken, "/attendance/reviews")).status).toBe(403);

    // Filter jenis & bulan
    const noLocation = await get(ownerToken, "/attendance/reviews?flag=no_location");
    expect(noLocation.body.data.items.map((i: { recordId: string }) => i.recordId).sort()).toEqual([mayaRecordId, ownRecordId].sort());
    expect((await get(ownerToken, "/attendance/reviews?month=2026-09")).body.data.total).toBe(0);

    // Atasan tidak bisa meninjau di luar bawahannya; owner tidak meninjau absensinya sendiri
    expect((await put(atasanToken, `/attendance/reviews/${mayaRecordId}/check_in`, { decision: "accepted" })).status).toBe(404);
    expect((await put(ownerToken, `/attendance/reviews/${ownRecordId}/check_in`, { decision: "accepted" })).status).toBe(403);
    // Pulang Dewi tidak bertanda; event tidak dikenal
    expect((await put(ownerToken, `/attendance/reviews/${dewiRecordId}/check_out`, { decision: "accepted" })).status).toBe(409);
    expect((await put(ownerToken, `/attendance/reviews/${dewiRecordId}/lunch`, { decision: "accepted" })).status).toBe(404);
    // Tindak lanjut wajib catatan
    expect((await put(atasanToken, `/attendance/reviews/${dewiRecordId}/check_in`, { decision: "follow_up", note: "" })).status).toBe(400);

    const accepted = await put(atasanToken, `/attendance/reviews/${dewiRecordId}/check_in`, { decision: "accepted", note: "Antar pesanan katering" });
    expect(accepted.status).toBe(200);
    const afterAccept = await get(ownerToken, "/attendance/reviews?status=reviewed");
    expect(afterAccept.body.data.items).toHaveLength(1);
    expect(afterAccept.body.data.items[0].review).toMatchObject({ decision: "accepted", note: "Antar pesanan katering", reviewedByName: "atasan Geo Tinjau" });
    expect((await get(ownerToken, "/attendance/reviews")).body.data.pendingCount).toBe(2);

    // Ubah keputusan → baris yang sama diperbarui
    expect((await put(ownerToken, `/attendance/reviews/${dewiRecordId}/check_in`, { decision: "follow_up", note: "Tanyakan alasan" })).status).toBe(200);
    const stored = await withTenant(db, { tenantId: ws.tenantId, userId: null }, (tx) =>
      tx.select({ decision: attendanceReviews.decision, note: attendanceReviews.note }).from(attendanceReviews),
    );
    expect(stored).toEqual([{ decision: "follow_up", note: "Tanyakan alasan" }]);

    const audit = await withTenant(db, { tenantId: ws.tenantId, userId: null }, (tx) =>
      tx
        .select({ before: auditLogs.before, after: auditLogs.after, actor: auditLogs.actorUserId })
        .from(auditLogs)
        .where(and(eq(auditLogs.entity, "attendance_record"), eq(auditLogs.action, "review"), eq(auditLogs.entityId, dewiRecordId)))
        .orderBy(auditLogs.createdAt),
    );
    expect(audit).toHaveLength(2);
    expect(audit[0]).toMatchObject({ actor: ws.userIds.atasan, before: null, after: { event: "check_in", flag: "outside", decision: "accepted" } });
    expect(audit[1]).toMatchObject({
      actor: ws.userIds.owner,
      before: { event: "check_in", decision: "accepted", note: "Antar pesanan katering" },
      after: { decision: "follow_up", note: "Tanyakan alasan" },
    });

    // Tinjauan tidak mengubah jam absen
    const [record] = await withTenant(db, { tenantId: ws.tenantId, userId: null }, (tx) =>
      tx.select({ checkInAt: attendanceRecords.checkInAt, lateMinutes: attendanceRecords.lateMinutes }).from(attendanceRecords).where(eq(attendanceRecords.id, dewiRecordId)),
    );
    expect(record).toEqual({ checkInAt: new Date("2026-10-04T23:58:00Z"), lateMinutes: 0 });
  });

  it("koreksi jam absen menghapus tanda pada jam yang diubah", async () => {
    const ws = await createWorkspace("Geo Koreksi");
    const owner = await tokenOf(ws, "owner");
    await createLocation(owner, KEDAI);
    await clock(ws, "2026-10-04T23:58:00Z", "check-in", near(KEDAI, 500, 10));
    await clock(ws, "2026-10-05T09:00:00Z", "check-out", null);

    setNow("2026-10-06T03:00:00Z");
    const ownerToken = await tokenOf(ws, "owner");
    expect((await get(ownerToken, "/attendance/reviews")).body.data.total).toBe(2);
    // Hanya jam pulang dikoreksi → tanda pulang hilang, tanda masuk tetap
    const corrected = await post(ownerToken, "/attendance/corrections", {
      employeeId: ws.employeeIds.karyawan,
      workDate: "2026-10-05",
      checkIn: "07:58",
      checkOut: "17:30",
      reason: "Lupa absen pulang di kedai",
    });
    expect(corrected.status, JSON.stringify(corrected.body)).toBe(201);
    const after = await get(ownerToken, "/attendance/reviews");
    expect(after.body.data.items.map((i: { event: string }) => i.event)).toEqual(["check_in"]);
  });
});

describe("isolasi tenant", () => {
  it("lokasi, pengaturan & tinjauan usaha lain tidak terlihat dan tidak bisa diubah", async () => {
    const a = await createWorkspace("Geo Iso A");
    const b = await createWorkspace("Geo Iso B");
    const ownerA = await tokenOf(a, "owner");
    const ownerB = await tokenOf(b, "owner");
    const kedaiA = await createLocation(ownerA, KEDAI);
    await put(ownerA, `/employees/${a.employeeIds.karyawan}/attendance-settings`, { locationMode: "selected", locationIds: [kedaiA] });
    const recordA = await insertFlagged(a, a.employeeIds.other, "2026-10-05", "2026-10-05T00:10:00Z");

    expect((await get(ownerB, "/attendance/locations")).body.data.items).toEqual([]);
    expect((await put(ownerB, `/attendance/locations/${kedaiA}`, KEDAI)).status).toBe(404);
    expect((await del(ownerB, `/attendance/locations/${kedaiA}`)).status).toBe(404);
    expect((await get(ownerB, `/employees/${a.employeeIds.karyawan}/attendance-settings`)).status).toBe(404);
    // Lokasi usaha A tidak bisa dipilih untuk karyawan usaha B
    expect((await put(ownerB, `/employees/${b.employeeIds.karyawan}/attendance-settings`, { locationMode: "selected", locationIds: [kedaiA] })).status).toBe(400);
    expect((await get(ownerB, "/attendance/reviews")).body.data.items).toEqual([]);
    expect((await put(ownerB, `/attendance/reviews/${recordA}/check_in`, { decision: "accepted" })).status).toBe(404);

    // Level database (app_user + RLS)
    const fromB = await withTenant(db, { tenantId: b.tenantId, userId: null }, async (tx) => ({
      locations: await tx.select({ id: workLocations.id }).from(workLocations),
      links: await tx.select({ id: employeeWorkLocations.employeeId }).from(employeeWorkLocations),
    }));
    expect(fromB).toEqual({ locations: [], links: [] });
    await expect(
      withTenant(db, { tenantId: b.tenantId, userId: null }, (tx) =>
        tx.insert(workLocations).values({ tenantId: a.tenantId, name: "Nyusup", latitude: 0, longitude: 0, radiusM: 100 }),
      ),
    ).rejects.toThrow();
    await expect(
      withTenant(db, { tenantId: b.tenantId, userId: null }, (tx) =>
        tx.insert(attendanceReviews).values({ tenantId: b.tenantId, attendanceRecordId: recordA, event: "check_in", decision: "accepted", reviewedAt: new Date() }),
      ),
    ).rejects.toThrow();
  });
});

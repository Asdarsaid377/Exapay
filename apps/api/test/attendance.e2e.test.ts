import "reflect-metadata";
import { randomUUID } from "node:crypto";

import * as schema from "@exapay/db";
import { attendanceRecords, companyHolidays, departments, employees, memberships, positions, tenants, users } from "@exapay/db";
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

// Verifikasi feature 14 (API): absen masuk/pulang dengan waktu server, zona waktu usaha, status telat, riwayat.
// Jam dipalsukan dengan vi.setSystemTime (hanya Date) — token login ulang setelah jam digeser agar tidak kedaluwarsa.

const PASSWORD = "password-attendance-123";
const ROLES = ["owner", "admin", "atasan", "karyawan"] as const;

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

async function createWorkspace(name: string, regencyCode: string | null): Promise<Workspace> {
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
        await tx.insert(tenants).values({ id: tenantId, name, regencyCode });
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

async function addEmployee(ws: Workspace, userId: string | null, overrides: { joinDate?: string; endDate?: string } = {}): Promise<string> {
  const id = randomUUID();
  await withTenant(db, { tenantId: ws.tenantId, userId: null }, (tx) =>
    tx.insert(employees).values({
      id,
      tenantId: ws.tenantId,
      fullName: `Karyawan ${id.slice(0, 6)}`,
      departmentId: ws.departmentId,
      positionId: ws.positionId,
      userId,
      joinDate: overrides.joinDate ?? "2025-01-01",
      endDate: overrides.endDate ?? null,
      endReason: overrides.endDate ? "Resign" : null,
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

const MAKASSAR = "73.71";
const HERE = { latitude: -5.1477, longitude: 119.4327, accuracy: 18 };

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

function setNow(iso: string): void {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(iso));
}

describe("absen masuk/pulang", () => {
  it("usaha di Makassar (WITA): telat dihitung dari jadwal lokal, sekali masuk & sekali pulang", async () => {
    const ws = await createWorkspace("Kopi Absen WITA", MAKASSAR);
    await addEmployee(ws, ws.userIds.karyawan);

    // Senin 5 Okt 2026 08:12:30 WITA = 00:12:30 UTC — jadwal bawaan masuk 08:00
    setNow("2026-10-05T00:12:30Z");
    let token = await tokenOf(ws, "karyawan");
    const before = await get(token, "/attendance/me/today");
    expect(before.status).toBe(200);
    expect(before.body.data).toMatchObject({
      access: "ok",
      timeZone: "Asia/Makassar",
      date: "2026-10-05",
      day: { isWorkday: true, startTime: "08:00", endTime: "17:00", holidayName: null },
      record: null,
    });
    expect(before.body.data.serverTime).toBe("2026-10-05T00:12:30.000Z");

    // Belum masuk → tidak bisa pulang
    const early = await post(token, "/attendance/me/check-out", { location: null });
    expect(early.status).toBe(409);
    expect(early.body.error).toBe("Anda belum absen masuk hari ini");

    // Jam dari client diabaikan (hanya lokasi yang diterima)
    const checkIn = await post(token, "/attendance/me/check-in", { location: HERE, checkInAt: "2026-10-05T00:00:00Z" });
    expect(checkIn.status, JSON.stringify(checkIn.body)).toBe(200);
    expect(checkIn.body.data).toMatchObject({
      workDate: "2026-10-05",
      checkInAt: "2026-10-05T00:12:30.000Z",
      checkOutAt: null,
      scheduledStart: "08:00",
      scheduledEnd: "17:00",
      lateMinutes: 12,
      status: "late",
      checkInLocated: true,
      checkOutLocated: false,
    });

    const again = await post(token, "/attendance/me/check-in", { location: null });
    expect(again.status).toBe(409);
    expect(again.body.error).toBe("Anda sudah absen masuk hari ini");

    // 17:05 WITA → pulang tanpa lokasi (izin ditolak) tetap tersimpan
    setNow("2026-10-05T09:05:00Z");
    token = await tokenOf(ws, "karyawan");
    const checkOut = await post(token, "/attendance/me/check-out", { location: null });
    expect(checkOut.status, JSON.stringify(checkOut.body)).toBe(200);
    expect(checkOut.body.data).toMatchObject({ checkOutAt: "2026-10-05T09:05:00.000Z", checkOutLocated: false, lateMinutes: 12 });
    expect((await post(token, "/attendance/me/check-out", { location: null })).body.error).toBe("Anda sudah absen pulang hari ini");

    const stored = await withTenant(db, { tenantId: ws.tenantId, userId: null }, (tx) =>
      tx
        .select({ lat: attendanceRecords.checkInLatitude, acc: attendanceRecords.checkInAccuracy, tz: attendanceRecords.timeZone })
        .from(attendanceRecords),
    );
    expect(stored).toEqual([{ lat: HERE.latitude, acc: HERE.accuracy, tz: "Asia/Makassar" }]);
  });

  it("tanpa kota usaha memakai WIB; tepat waktu sampai menit jam masuk; tanggal berganti di tengah malam lokal", async () => {
    const ws = await createWorkspace("Kopi Absen WIB", null);
    await addEmployee(ws, ws.userIds.karyawan);

    // 08:00:59 WIB = 01:00:59 UTC → tepat waktu
    setNow("2026-10-05T01:00:59Z");
    const token = await tokenOf(ws, "karyawan");
    const checkIn = await post(token, "/attendance/me/check-in", { location: null });
    expect(checkIn.body.data).toMatchObject({ workDate: "2026-10-05", lateMinutes: 0, status: "on_time", checkInLocated: false });

    // 00:30 WIB Selasa = 17:30 UTC Senin → tanggal kerja 6 Okt
    setNow("2026-10-05T17:30:00Z");
    const nextDay = await get(await tokenOf(ws, "karyawan"), "/attendance/me/today");
    expect(nextDay.body.data).toMatchObject({ timeZone: "Asia/Jakarta", date: "2026-10-06", record: null });
  });

  it("hari libur & akhir pekan: absen tetap dicatat tanpa jadwal, tidak pernah telat", async () => {
    const ws = await createWorkspace("Kopi Absen Libur", null);
    await addEmployee(ws, ws.userIds.karyawan);
    await withTenant(db, { tenantId: ws.tenantId, userId: null }, (tx) =>
      tx.insert(companyHolidays).values({ tenantId: ws.tenantId, date: "2026-10-07", name: "Ulang tahun usaha" }),
    );

    // Minggu 4 Okt 13:00 WIB
    setNow("2026-10-04T06:00:00Z");
    let token = await tokenOf(ws, "karyawan");
    const sunday = await post(token, "/attendance/me/check-in", { location: null });
    expect(sunday.body.data).toMatchObject({ scheduledStart: null, scheduledEnd: null, lateMinutes: 0, status: "off_day" });

    // Rabu 7 Okt (libur usaha) 10:00 WIB
    setNow("2026-10-07T03:00:00Z");
    token = await tokenOf(ws, "karyawan");
    const today = await get(token, "/attendance/me/today");
    expect(today.body.data.day).toEqual({ isWorkday: false, startTime: null, endTime: null, holidayName: "Ulang tahun usaha" });
    expect((await post(token, "/attendance/me/check-in", { location: null })).body.data.status).toBe("off_day");

    // Libur nasional 17 Agustus 2026 (Senin) 09:00 WIB
    setNow("2026-08-17T02:00:00Z");
    const independence = await get(await tokenOf(ws, "karyawan"), "/attendance/me/today");
    expect(independence.body.data.day).toMatchObject({ isWorkday: false, holidayName: expect.stringContaining("Kemerdekaan") });
  });

  it("semua peran yang tertaut data karyawan boleh absen; tidak tertaut / nonaktif ditolak", async () => {
    const ws = await createWorkspace("Kopi Absen Akses", null);
    await addEmployee(ws, ws.userIds.atasan);
    await addEmployee(ws, ws.userIds.admin, { endDate: "2026-09-30" });
    // Karyawan belum mulai bekerja
    await addEmployee(ws, ws.userIds.karyawan, { joinDate: "2026-11-01" });

    setNow("2026-10-05T01:30:00Z");
    const atasan = await tokenOf(ws, "atasan");
    expect((await post(atasan, "/attendance/me/check-in", { location: HERE })).status).toBe(200);

    const owner = await tokenOf(ws, "owner");
    expect((await get(owner, "/attendance/me/today")).body.data).toMatchObject({ access: "not_linked", record: null });
    const notLinked = await post(owner, "/attendance/me/check-in", { location: null });
    expect(notLinked.status).toBe(403);
    expect(notLinked.body.error).toContain("belum tertaut");

    const admin = await tokenOf(ws, "admin");
    expect((await get(admin, "/attendance/me/today")).body.data.access).toBe("inactive");
    expect((await post(admin, "/attendance/me/check-in", { location: null })).status).toBe(403);
    const karyawan = await tokenOf(ws, "karyawan");
    expect((await get(karyawan, "/attendance/me/today")).body.data.access).toBe("inactive");
    expect((await post(karyawan, "/attendance/me/check-out", { location: null })).status).toBe(403);
  });

  it("validasi lokasi; tanpa login ditolak", async () => {
    const ws = await createWorkspace("Kopi Absen Validasi", null);
    await addEmployee(ws, ws.userIds.karyawan);
    const token = await tokenOf(ws, "karyawan");
    expect((await post(token, "/attendance/me/check-in", {})).status).toBe(400);
    expect((await post(token, "/attendance/me/check-in", { location: { latitude: 120, longitude: 10, accuracy: null } })).status).toBe(400);
    expect((await post(token, "/attendance/me/check-in", { location: { latitude: "-5", longitude: 10, accuracy: null } })).status).toBe(400);
    expect((await request(server).get("/attendance/me/today")).status).toBe(401);
  });
});

describe("riwayat absensi", () => {
  it("per bulan, terbaru di atas, ringkasan hadir & telat; hanya milik sendiri", async () => {
    const ws = await createWorkspace("Kopi Riwayat", MAKASSAR);
    const mine = await addEmployee(ws, ws.userIds.karyawan);
    const other = await addEmployee(ws, ws.userIds.atasan);
    await withTenant(db, { tenantId: ws.tenantId, userId: null }, (tx) =>
      tx.insert(attendanceRecords).values([
        { tenantId: ws.tenantId, employeeId: mine, workDate: "2026-09-28", timeZone: "Asia/Makassar", scheduledStart: "08:00", scheduledEnd: "17:00", lateMinutes: 0, checkInAt: new Date("2026-09-27T23:55:00Z") },
        { tenantId: ws.tenantId, employeeId: mine, workDate: "2026-09-29", timeZone: "Asia/Makassar", scheduledStart: "08:00", scheduledEnd: "17:00", lateMinutes: 7, checkInAt: new Date("2026-09-29T00:07:00Z"), checkOutAt: new Date("2026-09-29T09:00:00Z") },
        { tenantId: ws.tenantId, employeeId: mine, workDate: "2026-09-30", timeZone: "Asia/Makassar", scheduledStart: "08:00", scheduledEnd: "17:00", lateMinutes: 20, checkInAt: new Date("2026-09-30T00:20:00Z") },
        { tenantId: ws.tenantId, employeeId: mine, workDate: "2026-10-01", timeZone: "Asia/Makassar", scheduledStart: "08:00", scheduledEnd: "17:00", lateMinutes: 0, checkInAt: new Date("2026-09-30T23:58:00Z") },
        { tenantId: ws.tenantId, employeeId: other, workDate: "2026-09-29", timeZone: "Asia/Makassar", scheduledStart: "08:00", scheduledEnd: "17:00", lateMinutes: 0, checkInAt: new Date("2026-09-28T23:50:00Z") },
      ]),
    );

    setNow("2026-10-01T02:00:00Z");
    const token = await tokenOf(ws, "karyawan");
    const september = await get(token, "/attendance/me/history?month=2026-09");
    expect(september.status).toBe(200);
    expect(september.body.data).toMatchObject({ access: "ok", month: "2026-09", currentMonth: "2026-10", timeZone: "Asia/Makassar" });
    expect(september.body.data.records.map((r: { workDate: string }) => r.workDate)).toEqual(["2026-09-30", "2026-09-29", "2026-09-28"]);
    // Alpa (feature 37): 22 hari kerja September − 3 hadir = 19
    expect(september.body.data.summary).toEqual({ present: 3, late: 2, lateMinutes: 27, absent: 19 });

    // Tanpa bulan → bulan berjalan
    const current = await get(token, "/attendance/me/history");
    expect(current.body.data.month).toBe("2026-10");
    expect(current.body.data.records).toHaveLength(1);

    expect((await get(token, "/attendance/me/history?month=2026-13")).status).toBe(400);
    expect((await get(token, "/attendance/me/history?month=1999-01")).status).toBe(400);

    const owner = await tokenOf(ws, "owner");
    expect((await get(owner, "/attendance/me/history?month=2026-09")).body.data).toMatchObject({ access: "not_linked", records: [] });
  });
});

describe("isolasi tenant attendance_records", () => {
  it("baris tenant lain tidak terbaca & tidak bisa ditulis; tidak ada DELETE", async () => {
    const a = await createWorkspace("Kopi Isolasi A", null);
    const b = await createWorkspace("Kopi Isolasi B", null);
    const employeeA = await addEmployee(a, a.userIds.karyawan);
    await withTenant(db, { tenantId: a.tenantId, userId: null }, (tx) =>
      tx.insert(attendanceRecords).values({ tenantId: a.tenantId, employeeId: employeeA, workDate: "2026-10-05", timeZone: "Asia/Jakarta", checkInAt: new Date() }),
    );

    const seenFromB = await withTenant(db, { tenantId: b.tenantId, userId: null }, (tx) => tx.select({ id: attendanceRecords.id }).from(attendanceRecords));
    expect(seenFromB).toEqual([]);
    // Menyisipkan untuk tenant lain / merujuk karyawan tenant lain ditolak
    await expect(
      withTenant(db, { tenantId: b.tenantId, userId: null }, (tx) =>
        tx.insert(attendanceRecords).values({ tenantId: a.tenantId, employeeId: employeeA, workDate: "2026-10-06", timeZone: "Asia/Jakarta", checkInAt: new Date() }),
      ),
    ).rejects.toThrow();
    await expect(
      withTenant(db, { tenantId: b.tenantId, userId: null }, (tx) =>
        tx.insert(attendanceRecords).values({ tenantId: b.tenantId, employeeId: employeeA, workDate: "2026-10-06", timeZone: "Asia/Jakarta", checkInAt: new Date() }),
      ),
    ).rejects.toThrow();
    await expect(
      withTenant(db, { tenantId: a.tenantId, userId: null }, (tx) => tx.delete(attendanceRecords).where(eq(attendanceRecords.employeeId, employeeA))),
    ).rejects.toThrow();
  });
});

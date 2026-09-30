import "reflect-metadata";
import { randomUUID } from "node:crypto";

import * as schema from "@exapay/db";
import { attendanceCorrections, attendanceRecords, auditLogs, departments, employees, leaveRequests, memberships, positions, tenants, users } from "@exapay/db";
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

// Verifikasi feature 16 (API): rekap per periode (hadir, telat, alpa, izin) → koreksi owner/admin mengubah rekap
// dan tercatat di riwayat koreksi + audit log.

const PASSWORD = "password-recap-123";
const ROLES = ["owner", "admin", "atasan", "karyawan"] as const;
// Senin 5 – Minggu 11 Okt 2026 (tanpa libur nasional)
const WEEK = "from=2026-10-05&to=2026-10-11";

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

async function addEmployee(ws: Workspace, fullName: string, userId: string | null, supervisorId: string | null = null): Promise<string> {
  const id = randomUUID();
  await withTenant(db, { tenantId: ws.tenantId, userId: null }, (tx) =>
    tx.insert(employees).values({
      id,
      tenantId: ws.tenantId,
      fullName,
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

// Jam WIB (UTC+7) pada tanggal tertentu → instant
function wib(date: string, time: string): Date {
  return new Date(Date.parse(`${date}T${time}:00+07:00`));
}

async function addRecord(ws: Workspace, employeeId: string, workDate: string, checkIn: string, checkOut: string | null, late: number): Promise<void> {
  await withTenant(db, { tenantId: ws.tenantId, userId: null }, (tx) =>
    tx.insert(attendanceRecords).values({
      tenantId: ws.tenantId,
      employeeId,
      workDate,
      timeZone: "Asia/Jakarta",
      scheduledStart: "08:00",
      scheduledEnd: "17:00",
      lateMinutes: late,
      checkInAt: wib(workDate, checkIn),
      checkInLatitude: -5.14,
      checkInLongitude: 119.42,
      checkOutAt: checkOut ? wib(workDate, checkOut) : null,
    }),
  );
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

type RecapRow = { employee: { id: string }; summary: Record<string, number> };

function summaryOf(body: { data: { rows: RecapRow[] } }, employeeId: string): Record<string, number> | undefined {
  return body.data.rows.find((row) => row.employee.id === employeeId)?.summary;
}

// Jumat 9 Okt 2026, 10:00 WIB
function setNow(): void {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-09T03:00:00Z"));
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

describe("rekap absensi → koreksi owner/admin", () => {
  it("rekap menghitung hadir/telat/alpa/izin; koreksi mengubah rekap, tercatat di riwayat & audit log", async () => {
    setNow();
    const ws = await createWorkspace("Kopi Rekap");
    const supervisor = await addEmployee(ws, "Andi Atasan", ws.userIds.atasan);
    const dewi = await addEmployee(ws, "Dewi Lestari", ws.userIds.karyawan, supervisor);
    await addEmployee(ws, "Siti Admin", ws.userIds.admin);

    // Sen tepat waktu, Sel telat 30 menit tanpa pulang, Rab alpa, Kam izin disetujui, Jum (hari ini) belum absen
    await addRecord(ws, dewi, "2026-10-05", "07:55", "17:02", 0);
    await addRecord(ws, dewi, "2026-10-06", "08:30", null, 30);
    await withTenant(db, { tenantId: ws.tenantId, userId: null }, (tx) =>
      tx.insert(leaveRequests).values({
        tenantId: ws.tenantId,
        employeeId: dewi,
        type: "permit",
        startDate: "2026-10-08",
        endDate: "2026-10-08",
        reason: "Urusan keluarga",
        status: "approved",
        decidedAt: new Date(),
      }),
    );

    const owner = await tokenOf(ws, "owner");
    const admin = await tokenOf(ws, "admin");
    const atasan = await tokenOf(ws, "atasan");
    const karyawan = await tokenOf(ws, "karyawan");

    const recap = await get(owner, `/attendance/recap?${WEEK}`);
    expect(recap.status, JSON.stringify(recap.body)).toBe(200);
    expect(recap.body.data).toMatchObject({ from: "2026-10-05", to: "2026-10-11", today: "2026-10-09", scope: "all", workingDays: 5 });
    expect(recap.body.data.rows).toHaveLength(3);
    expect(summaryOf(recap.body, dewi)).toEqual({
      workingDays: 5,
      present: 2,
      late: 1,
      lateMinutes: 30,
      absent: 1,
      permit: 1,
      sick: 0,
      leave: 0,
      offDayPresent: 0,
      missingCheckOut: 1,
    });

    // Atasan: hanya bawahan langsung; karyawan tidak punya akses
    const scoped = await get(atasan, `/attendance/recap?${WEEK}`);
    expect(scoped.status).toBe(200);
    expect(scoped.body.data.scope).toBe("subordinates");
    expect(scoped.body.data.rows.map((row: RecapRow) => row.employee.id)).toEqual([dewi]);
    expect((await get(karyawan, `/attendance/recap?${WEEK}`)).status).toBe(403);

    // Koreksi hari alpa (Rabu): baris absensi dibuat
    const fixAbsent = { employeeId: dewi, workDate: "2026-10-07", checkIn: "08:05", checkOut: "17:00", reason: "Lupa absen, hadir sesuai buku tamu" };
    expect((await post(atasan, "/attendance/corrections", fixAbsent)).status).toBe(403);
    const created = await post(owner, "/attendance/corrections", fixAbsent);
    expect(created.status, JSON.stringify(created.body)).toBe(201);

    // Koreksi lupa pulang (Selasa) + jam masuk → tidak telat lagi
    const fixCheckOut = await post(admin, "/attendance/corrections", {
      employeeId: dewi,
      workDate: "2026-10-06",
      checkIn: "08:00",
      checkOut: "17:10",
      reason: "Jam masuk sesuai CCTV, lupa absen pulang",
    });
    expect(fixCheckOut.status, JSON.stringify(fixCheckOut.body)).toBe(201);

    const after = await get(owner, `/attendance/recap?${WEEK}`);
    expect(summaryOf(after.body, dewi)).toMatchObject({ present: 3, late: 1, lateMinutes: 5, absent: 0, permit: 1, missingCheckOut: 0 });

    // Baris Selasa: jam & telat baru, lokasi ketukan asli dilepas dari jam yang diubah
    const [tuesday] = await withTenant(db, { tenantId: ws.tenantId, userId: null }, (tx) =>
      tx
        .select({ checkInAt: attendanceRecords.checkInAt, checkOutAt: attendanceRecords.checkOutAt, lateMinutes: attendanceRecords.lateMinutes, lat: attendanceRecords.checkInLatitude })
        .from(attendanceRecords)
        .where(and(eq(attendanceRecords.employeeId, dewi), eq(attendanceRecords.workDate, "2026-10-06"))),
    );
    expect(tuesday).toEqual({ checkInAt: wib("2026-10-06", "08:00"), checkOutAt: wib("2026-10-06", "17:10"), lateMinutes: 0, lat: null });

    // Riwayat koreksi (terbaru di atas)
    const history = await get(owner, `/attendance/corrections?employeeId=${dewi}`);
    expect(history.status).toBe(200);
    expect(history.body.data).toMatchObject({ total: 2, timeZone: "Asia/Jakarta" });
    expect(history.body.data.items[0]).toMatchObject({
      workDate: "2026-10-06",
      before: { checkInAt: wib("2026-10-06", "08:30").toISOString(), checkOutAt: null, lateMinutes: 30 },
      after: { checkInAt: wib("2026-10-06", "08:00").toISOString(), checkOutAt: wib("2026-10-06", "17:10").toISOString(), lateMinutes: 0 },
      correctedByName: "admin Kopi Rekap",
    });
    expect(history.body.data.items[1]).toMatchObject({ workDate: "2026-10-07", before: { checkInAt: null, checkOutAt: null, lateMinutes: null }, after: { lateMinutes: 5 } });
    expect((await get(atasan, "/attendance/corrections")).status).toBe(403);

    // Audit log
    const audits = await withTenant(db, { tenantId: ws.tenantId, userId: null }, (tx) =>
      tx.select({ action: auditLogs.action, after: auditLogs.after }).from(auditLogs).where(eq(auditLogs.entity, "attendance_record")),
    );
    expect(audits).toHaveLength(2);
    expect(audits.every((a) => a.action === "correct")).toBe(true);
    expect(audits.map((a) => (a.after as { reason: string }).reason).sort()).toEqual([fixAbsent.reason, "Jam masuk sesuai CCTV, lupa absen pulang"].sort());

    // Rincian harian: status + penanda dikoreksi
    const days = await get(owner, `/attendance/recap/${dewi}?${WEEK}`);
    expect(days.status, JSON.stringify(days.body)).toBe(200);
    expect(days.body.data.days.map((d: { status: string }) => d.status)).toEqual(["on_time", "on_time", "late", "permit", "pending", "off", "off"]);
    expect(days.body.data.days.map((d: { corrected: boolean }) => d.corrected)).toEqual([false, true, true, false, false, false, false]);
    expect(days.body.data.canCorrect).toBe(true);
    expect(days.body.data.days[1].record).toMatchObject({ checkOutAt: wib("2026-10-06", "17:10").toISOString(), scheduledStart: "08:00" });
  });

  it("menolak koreksi yang tidak mengubah apa pun, tanggal/jam mendatang, di luar masa kerja, dan absensi sendiri", async () => {
    setNow();
    const ws = await createWorkspace("Kopi Koreksi Tolak");
    const dewi = await addEmployee(ws, "Dewi", ws.userIds.karyawan);
    const siti = await addEmployee(ws, "Siti Admin", ws.userIds.admin);
    await addRecord(ws, dewi, "2026-10-05", "07:55", "17:02", 0);
    const owner = await tokenOf(ws, "owner");
    const admin = await tokenOf(ws, "admin");
    const base = { employeeId: dewi, reason: "Uji koreksi" };

    const same = await post(owner, "/attendance/corrections", { ...base, workDate: "2026-10-05", checkIn: "07:55", checkOut: "17:02" });
    expect(same.status).toBe(400);
    expect((await post(owner, "/attendance/corrections", { ...base, workDate: "2026-10-10", checkIn: "08:00", checkOut: null })).status).toBe(400);
    // Hari ini 10:00 WIB — jam pulang 17:00 belum terjadi
    expect((await post(owner, "/attendance/corrections", { ...base, workDate: "2026-10-09", checkIn: "08:00", checkOut: "17:00" })).status).toBe(400);
    expect((await post(owner, "/attendance/corrections", { ...base, workDate: "2026-10-09", checkIn: "08:00", checkOut: null })).status).toBe(201);
    expect((await post(owner, "/attendance/corrections", { ...base, workDate: "2024-12-31", checkIn: "08:00", checkOut: null })).status).toBe(400);
    // Pulang sebelum masuk (validasi skema)
    expect((await post(owner, "/attendance/corrections", { ...base, workDate: "2026-10-06", checkIn: "17:00", checkOut: "08:00" })).status).toBe(400);
    const self = await post(admin, "/attendance/corrections", { ...base, employeeId: siti, workDate: "2026-10-06", checkIn: "08:00", checkOut: null });
    expect(self.status).toBe(403);
    expect((await post(owner, "/attendance/corrections", { ...base, employeeId: randomUUID(), workDate: "2026-10-06", checkIn: "08:00", checkOut: null })).status).toBe(404);
  });
});

describe("isolasi tenant attendance_corrections", () => {
  it("baris tenant lain tidak terbaca; append-only (tanpa UPDATE/DELETE)", async () => {
    const a = await createWorkspace("Kopi Isolasi Koreksi A");
    const b = await createWorkspace("Kopi Isolasi Koreksi B");
    const employeeA = await addEmployee(a, "Karyawan A", null);
    await addRecord(a, employeeA, "2026-10-05", "08:00", null, 0);
    await withTenant(db, { tenantId: a.tenantId, userId: null }, async (tx) => {
      const [record] = await tx.select({ id: attendanceRecords.id }).from(attendanceRecords).where(eq(attendanceRecords.employeeId, employeeA));
      if (!record) throw new Error("absen tidak ada");
      await tx.insert(attendanceCorrections).values({
        tenantId: a.tenantId,
        attendanceRecordId: record.id,
        employeeId: employeeA,
        workDate: "2026-10-05",
        afterCheckInAt: new Date(),
        afterLateMinutes: 0,
        reason: "Uji",
      });
    });

    const seenFromB = await withTenant(db, { tenantId: b.tenantId, userId: null }, (tx) => tx.select({ id: attendanceCorrections.id }).from(attendanceCorrections));
    expect(seenFromB).toEqual([]);
    await expect(
      withTenant(db, { tenantId: a.tenantId, userId: null }, (tx) => tx.update(attendanceCorrections).set({ reason: "ubah" }).where(eq(attendanceCorrections.employeeId, employeeA))),
    ).rejects.toThrow();
    await expect(
      withTenant(db, { tenantId: a.tenantId, userId: null }, (tx) => tx.delete(attendanceCorrections).where(eq(attendanceCorrections.employeeId, employeeA))),
    ).rejects.toThrow();
  });
});

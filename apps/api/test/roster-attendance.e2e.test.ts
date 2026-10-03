import "reflect-metadata";
import { randomUUID } from "node:crypto";

import * as schema from "@exapay/db";
import { attendanceRecords, auditLogs, departments, employees, memberships, positions, shiftRosterDays, tenants, users } from "@exapay/db";
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
import { AttendanceDeductionRulesService } from "../src/modules/attendance/attendance-deduction-rules.service.js";
import { seedTenantDefaults } from "../src/modules/tenants/tenant-defaults.js";

// Verifikasi feature 47 (API): absen karyawan mode shift dicocokkan ke roster — dibuka 2 jam sebelum mulai, telat dari jam
// shift, shift malam di tanggal mulai (pulang keesokan hari), hari tanpa shift = tanda "Tanpa jadwal" di antrean tinjauan;
// rekap & potongan memakai hari roster; karyawan ikut jadwal usaha tidak berubah. Jam dipalsukan (hanya Date), login ulang
// setelah digeser. WITA = UTC+8.

const PASSWORD = "password-roster-absen-123";
const ROLES = ["owner", "admin", "atasan", "karyawan"] as const;
const MAKASSAR = "73.71";

let app: INestApplication;
let server: Parameters<typeof request>[0];
let pool: pg.Pool;
let db: Database;

type Workspace = {
  tenantId: string;
  emails: Record<MembershipRole, string>;
  // karyawan (Dewi) = mode shift, bawahan atasan; budi (akun owner) = ikut jadwal usaha
  employeeIds: { atasan: string; karyawan: string; budi: string };
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
    const employeeIds = { atasan: randomUUID(), karyawan: randomUUID(), budi: randomUUID() };
    await tx.insert(employees).values([
      { ...base, id: employeeIds.atasan, fullName: `Atasan ${name}`, userId: userIds.atasan },
      { ...base, id: employeeIds.karyawan, fullName: `Dewi ${name}`, userId: userIds.karyawan, supervisorId: employeeIds.atasan },
      { ...base, id: employeeIds.budi, fullName: `Budi ${name}`, userId: userIds.owner },
    ]);
    return { tenantId, emails, employeeIds };
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

// Jam WITA → geser jam sistem lalu login ulang sebagai peran itu
async function at(ws: Workspace, witaIso: string, role: MembershipRole): Promise<string> {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(`${witaIso}+08:00`));
  return tokenOf(ws, role);
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

describe("absensi berbasis roster", () => {
  it("shift pagi, shift malam lintas tanggal, tanpa jadwal + tinjauan, rekap & potongan hari roster, jadwal usaha tetap", async () => {
    const ws = await createWorkspace("Roster Absen");
    const dewi = ws.employeeIds.karyawan;
    let owner = await at(ws, "2026-10-04T10:00:00", "owner");
    const pagi = (await post(owner, "/attendance/shifts", { name: "Pagi", startTime: "07:00", endTime: "15:00" })).body.data.id;
    const malam = (await post(owner, "/attendance/shifts", { name: "Malam", startTime: "22:00", endTime: "06:00" })).body.data.id;
    expect((await put(owner, `/employees/${dewi}/attendance-settings`, { locationMode: "all", scheduleMode: "shift" })).status).toBe(200);
    for (const [date, body] of [
      ["2026-10-05", { kind: "shift", shiftId: pagi }],
      ["2026-10-06", { kind: "shift", shiftId: malam }],
      ["2026-10-07", { kind: "off" }],
    ] as const) {
      expect((await put(owner, `/attendance/roster/${dewi}/${date}`, body)).status).toBe(200);
    }
    // Roster minggu lalu (sudah terkunci di API) langsung di DB: Kamis 1 Okt Pagi, Jumat 2 Okt libur, Sab–Min belum diatur
    await withTenant(db, { tenantId: ws.tenantId, userId: null }, (tx) =>
      tx.insert(shiftRosterDays).values([
        { tenantId: ws.tenantId, employeeId: dewi, workDate: "2026-10-01", workShiftId: pagi, shiftName: "Pagi", startTime: "07:00", endTime: "15:00" },
        { tenantId: ws.tenantId, employeeId: dewi, workDate: "2026-10-02" },
      ]),
    );

    // Senin 04:30 — terlalu awal (dibuka 05:00)
    let karyawan = await at(ws, "2026-10-05T04:30:00", "karyawan");
    const today = await get(karyawan, "/attendance/me/today");
    expect(today.body.data.shift).toEqual({
      workDate: "2026-10-05",
      entry: expect.objectContaining({ kind: "shift", name: "Pagi", startTime: "07:00" }),
      checkInOpensAt: "2026-10-04T21:00:00.000Z",
    });
    const tooEarly = await post(karyawan, "/attendance/me/check-in", { location: null });
    expect(tooEarly.status).toBe(400);
    expect(tooEarly.body.error).toBe("Absen masuk shift Pagi baru dibuka pukul 05:00");

    // Senin 07:10 — telat 10 menit dari jam shift
    karyawan = await at(ws, "2026-10-05T07:10:00", "karyawan");
    const morning = await post(karyawan, "/attendance/me/check-in", { location: null });
    expect(morning.status, JSON.stringify(morning.body)).toBe(200);
    expect(morning.body.data).toMatchObject({ workDate: "2026-10-05", scheduledStart: "07:00", lateMinutes: 10, status: "late", shiftName: "Pagi", unscheduled: false });

    // Karyawan ikut jadwal usaha: telat dari 08:00 seperti sebelumnya
    owner = await at(ws, "2026-10-05T08:20:00", "owner");
    const business = await post(owner, "/attendance/me/check-in", { location: null });
    expect(business.body.data).toMatchObject({ workDate: "2026-10-05", scheduledStart: "08:00", lateMinutes: 20, shiftName: null, unscheduled: false });
    expect((await get(owner, "/attendance/me/today")).body.data.shift).toBeNull();

    // Selasa 21:55 masuk shift malam → Rabu 06:05 pulang ke absen tanggal 6
    karyawan = await at(ws, "2026-10-06T21:55:00", "karyawan");
    const night = await post(karyawan, "/attendance/me/check-in", { location: null });
    expect(night.body.data).toMatchObject({ workDate: "2026-10-06", scheduledStart: "22:00", scheduledEnd: "06:00", lateMinutes: 0, shiftName: "Malam" });
    karyawan = await at(ws, "2026-10-07T06:05:00", "karyawan");
    const nightCard = await get(karyawan, "/attendance/me/today");
    expect(nightCard.body.data).toMatchObject({ date: "2026-10-07", shift: { workDate: "2026-10-06", checkInOpensAt: null }, record: { workDate: "2026-10-06", checkOutAt: null } });
    const nightOut = await post(karyawan, "/attendance/me/check-out", { location: null });
    expect(nightOut.status, JSON.stringify(nightOut.body)).toBe(200);
    expect(nightOut.body.data).toMatchObject({ workDate: "2026-10-06", checkOutAt: "2026-10-06T22:05:00.000Z" });

    // Rabu 10:00 (libur di roster) — diterima + tanda Tanpa jadwal
    karyawan = await at(ws, "2026-10-07T10:00:00", "karyawan");
    const offDay = await post(karyawan, "/attendance/me/check-in", { location: null });
    expect(offDay.body.data).toMatchObject({ workDate: "2026-10-07", scheduledStart: null, lateMinutes: 0, status: "off_day", unscheduled: true });
    expect((await get(karyawan, "/attendance/me/today")).body.data.shift).toMatchObject({ workDate: "2026-10-07", entry: { kind: "off" } });

    const atasan = await tokenOf(ws, "atasan");
    const queue = await get(atasan, "/attendance/reviews?flag=no_schedule");
    expect(queue.body.data).toMatchObject({ total: 1, pendingCount: 1, hasShifts: true, hasLocations: false });
    expect(queue.body.data.items[0]).toMatchObject({ recordId: offDay.body.data.id, event: "check_in", workDate: "2026-10-07", flag: { kind: "no_schedule" }, review: null });
    // Tanpa subject = tanda lokasi → absen ini tidak bertanda lokasi
    expect((await put(atasan, `/attendance/reviews/${offDay.body.data.id}/check_in`, { decision: "accepted" })).status).toBe(409);
    expect((await put(atasan, `/attendance/reviews/${offDay.body.data.id}/check_out`, { decision: "accepted", subject: "schedule" })).status).toBe(409);
    const decided = await put(atasan, `/attendance/reviews/${offDay.body.data.id}/check_in`, { decision: "accepted", note: "Menggantikan rekan", subject: "schedule" });
    expect(decided.status, JSON.stringify(decided.body)).toBe(200);
    expect((await get(atasan, "/attendance/reviews?flag=no_schedule&status=reviewed")).body.data.items[0].review).toMatchObject({ decision: "accepted", note: "Menggantikan rekan" });
    const audit = await withTenant(db, { tenantId: ws.tenantId, userId: null }, (tx) =>
      tx.select({ after: auditLogs.after }).from(auditLogs).where(and(eq(auditLogs.entityId, offDay.body.data.id), eq(auditLogs.action, "review"))),
    );
    expect(audit).toEqual([{ after: expect.objectContaining({ subject: "schedule", flag: "no_schedule", decision: "accepted" }) }]);

    // Rekap 1–7 Okt: hari kerja = hari ber-shift (1, 5, 6); alpa hanya Kamis 1 Okt; Rabu hadir di luar jadwal
    owner = await tokenOf(ws, "owner");
    const days = await get(owner, `/attendance/recap/${dewi}?from=2026-10-01&to=2026-10-07`);
    expect(days.status, JSON.stringify(days.body)).toBe(200);
    expect(days.body.data.scheduleMode).toBe("shift");
    expect(days.body.data.days.map((d: { status: string }) => d.status)).toEqual(["absent", "off", "off", "off", "late", "on_time", "off_day_present"]);
    expect(days.body.data.days.map((d: { shift: { kind: string; name?: string } | null }) => d.shift?.name ?? d.shift?.kind ?? null)).toEqual([
      "Pagi",
      "off",
      null,
      null,
      "Pagi",
      "Malam",
      "off",
    ]);
    expect(days.body.data.days[6].record).toMatchObject({ unscheduled: true, shiftName: null });
    expect(days.body.data.summary).toMatchObject({ workingDays: 3, present: 2, late: 1, absent: 1, offDayPresent: 1 });
    // Budi (jadwal usaha) tetap memakai jadwal Sen–Jum: 1, 2, 5, 6, 7 = 5 hari kerja
    const budiDays = await get(owner, `/attendance/recap/${ws.employeeIds.budi}?from=2026-10-01&to=2026-10-07`);
    expect(budiDays.body.data).toMatchObject({ scheduleMode: "business", summary: { workingDays: 5, present: 1, absent: 3 } });

    // Potongan absensi: pembagi = hari roster (shift 1, 5, 6; Sab–Min belum diatur bukan hari kerja usaha)
    const deductions = app.get(AttendanceDeductionRulesService);
    const facts = await withTenant(db, { tenantId: ws.tenantId, userId: null }, (tx) =>
      deductions.periodFactsMany(tx, [{ id: dewi, joinDate: "2025-01-01", endDate: null }], "2026-10-01", "2026-10-07", "2026-10-07"),
    );
    expect(facts.get(dewi)).toMatchObject({ periodWorkingDays: 3, employedWorkingDays: 3, absentDays: 1, lateMinutes: [10] });

    // Koreksi shift malam: jam pulang sebelum jam masuk = keesokan hari; hari tanpa shift tidak boleh
    const fixNight = await post(owner, "/attendance/corrections", { employeeId: dewi, workDate: "2026-10-06", checkIn: "22:05", checkOut: "06:30", reason: "Lupa absen" });
    expect(fixNight.status, JSON.stringify(fixNight.body)).toBe(201);
    const record = await withTenant(db, { tenantId: ws.tenantId, userId: null }, (tx) =>
      tx
        .select({ checkOutAt: attendanceRecords.checkOutAt, lateMinutes: attendanceRecords.lateMinutes })
        .from(attendanceRecords)
        .where(and(eq(attendanceRecords.employeeId, dewi), eq(attendanceRecords.workDate, "2026-10-06"))),
    );
    expect(record).toEqual([{ checkOutAt: new Date("2026-10-06T22:30:00Z"), lateMinutes: 5 }]);
    const badFix = await post(owner, "/attendance/corrections", { employeeId: dewi, workDate: "2026-10-05", checkIn: "07:00", checkOut: "06:00", reason: "Salah" });
    expect(badFix.status).toBe(400);
  });
});

import "reflect-metadata";
import { randomUUID } from "node:crypto";

import * as schema from "@exapay/db";
import { attendanceRecords, auditLogs, departments, employees, memberships, positions, shiftRosterDays, tenants, users, workShifts } from "@exapay/db";
import { type MembershipRole, ROSTER_QUEUE_NAME } from "@exapay/shared";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { hash } from "@node-rs/argon2";
import { Queue } from "bullmq";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Redis } from "ioredis";
import pg from "pg";
import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, inject, it, vi } from "vitest";

import { AppModule } from "../src/app.module.js";
import { configureApp } from "../src/app.setup.js";
import { type Database, withTenant, withUser } from "../src/database/tenant-transaction.js";
import { seedTenantDefaults } from "../src/modules/tenants/tenant-defaults.js";

// Verifikasi feature 46 (API): master shift (opsional), mode jadwal per karyawan, roster per tanggal (cakupan atasan, sel
// terkunci, audit dari → ke, salin minggu lalu), ubah/hapus shift memperbarui roster yang belum terkunci, "Jadwal saya",
// pemberitahuan antrean, isolasi tenant. Jam dipalsukan dengan vi.setSystemTime (hanya Date) — login ulang setelah digeser.
// Senin 5 Okt 2026 09:00 WITA = 2026-10-05T01:00Z.

const PASSWORD = "password-roster-123";
const ROLES = ["owner", "admin", "atasan", "karyawan"] as const;
const MAKASSAR = "73.71";
const NOW = "2026-10-05T01:00:00Z";

let app: INestApplication;
let server: Parameters<typeof request>[0];
let pool: pg.Pool;
let db: Database;
let queueConnection: Redis;
let queue: Queue;

type Workspace = {
  tenantId: string;
  emails: Record<MembershipRole, string>;
  // atasan → bawahan karyawan (Dewi); maya = karyawan lain bukan bawahan atasan, tanpa akun; budi = ikut jadwal usaha
  employeeIds: { atasan: string; karyawan: string; maya: string; budi: string };
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
    const employeeIds = { atasan: randomUUID(), karyawan: randomUUID(), maya: randomUUID(), budi: randomUUID() };
    await tx.insert(employees).values([
      { ...base, id: employeeIds.atasan, fullName: `Atasan ${name}`, userId: userIds.atasan },
      { ...base, id: employeeIds.karyawan, fullName: `Dewi ${name}`, userId: userIds.karyawan, supervisorId: employeeIds.atasan },
      { ...base, id: employeeIds.maya, fullName: `Maya ${name}` },
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
const del = (token: string, path: string): request.Test => request(server).delete(path).set("Authorization", `Bearer ${token}`);

function setNow(iso: string): void {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(iso));
}

async function createShift(token: string, name: string, startTime: string, endTime: string): Promise<string> {
  const res = await post(token, "/attendance/shifts", { name, startTime, endTime });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body.data.id;
}

async function setMode(token: string, employeeId: string, scheduleMode: "business" | "shift"): Promise<request.Response> {
  return put(token, `/employees/${employeeId}/attendance-settings`, { locationMode: "all", scheduleMode });
}

async function rosterRows(ws: Workspace, employeeId: string) {
  return withTenant(db, { tenantId: ws.tenantId, userId: null }, (tx) =>
    tx
      .select({ workDate: shiftRosterDays.workDate, workShiftId: shiftRosterDays.workShiftId, shiftName: shiftRosterDays.shiftName, startTime: shiftRosterDays.startTime })
      .from(shiftRosterDays)
      .where(eq(shiftRosterDays.employeeId, employeeId))
      .orderBy(shiftRosterDays.workDate),
  );
}

async function pendingNotices(ws: Workspace, employeeId: string): Promise<number> {
  const jobs = await queue.getDelayed();
  return jobs.filter((job) => job.data.tenantId === ws.tenantId && job.data.employeeId === employeeId).length;
}

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: inject("testDatabaseUrl") });
  db = drizzle({ client: pool, schema });
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();
  server = app.getHttpServer();
  queueConnection = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379/15", { maxRetriesPerRequest: null });
  queue = new Queue(ROSTER_QUEUE_NAME, { connection: queueConnection });
});

afterEach(() => {
  vi.useRealTimers();
});

afterAll(async () => {
  await queue?.close();
  await queueConnection?.quit();
  await app?.close();
  await pool?.end();
});

describe("shift opsional", () => {
  it("usaha tanpa shift: daftar kosong, mode shift ditolak, roster tanpa shift", async () => {
    const ws = await createWorkspace("Roster Tanpa Shift");
    const owner = await tokenOf(ws, "owner");
    expect((await get(owner, "/attendance/shifts")).body.data).toEqual({ items: [], shiftEmployeeCount: 0, canManage: true });
    const settings = await get(owner, `/employees/${ws.employeeIds.karyawan}/attendance-settings`);
    expect(settings.body.data).toMatchObject({ scheduleMode: "business", hasShifts: false });
    const shiftMode = await setMode(owner, ws.employeeIds.karyawan, "shift");
    expect(shiftMode.status).toBe(400);
    expect(shiftMode.body.error).toContain("Buat shift dulu");
    const roster = await get(owner, "/attendance/roster");
    expect(roster.body.data).toMatchObject({ hasShifts: false, employees: [], businessModeCount: 4 });
  });
});

describe("master shift", () => {
  it("owner/admin kelola + audit; atasan hanya baca; karyawan ditolak; validasi", async () => {
    const ws = await createWorkspace("Roster Master");
    const owner = await tokenOf(ws, "owner");
    const admin = await tokenOf(ws, "admin");
    const atasan = await tokenOf(ws, "atasan");
    const karyawan = await tokenOf(ws, "karyawan");

    const pagi = await createShift(owner, "Pagi", "07:00", "15:00");
    await createShift(admin, "Malam", "22:00", "06:00");
    expect((await post(owner, "/attendance/shifts", { name: "pagi", startTime: "08:00", endTime: "16:00" })).status).toBe(409);
    expect((await post(owner, "/attendance/shifts", { name: "Aneh", startTime: "08:00", endTime: "08:00" })).status).toBe(400);
    expect((await post(atasan, "/attendance/shifts", { name: "Siang", startTime: "15:00", endTime: "23:00" })).status).toBe(403);
    expect((await get(karyawan, "/attendance/shifts")).status).toBe(403);

    const list = await get(atasan, "/attendance/shifts");
    expect(list.status).toBe(200);
    expect(list.body.data.canManage).toBe(false);
    expect(list.body.data.items).toEqual([
      expect.objectContaining({ name: "Pagi", startTime: "07:00", endTime: "15:00", overnight: false, durationMinutes: 480 }),
      expect.objectContaining({ name: "Malam", startTime: "22:00", endTime: "06:00", overnight: true, durationMinutes: 480 }),
    ]);

    const audit = await withTenant(db, { tenantId: ws.tenantId, userId: null }, (tx) =>
      tx.select({ action: auditLogs.action, after: auditLogs.after }).from(auditLogs).where(and(eq(auditLogs.entity, "work_shift"), eq(auditLogs.entityId, pagi))),
    );
    expect(audit).toEqual([{ action: "create", after: { name: "Pagi", startTime: "07:00", endTime: "15:00" } }]);
  });
});

describe("roster", () => {
  it("atur sel, cakupan atasan, sel terkunci, audit dari → ke, pemberitahuan, Jadwal saya", async () => {
    const ws = await createWorkspace("Roster Atur");
    setNow(NOW);
    const owner = await tokenOf(ws, "owner");
    const pagi = await createShift(owner, "Pagi", "07:00", "15:00");
    const malam = await createShift(owner, "Malam", "22:00", "06:00");
    expect((await setMode(owner, ws.employeeIds.karyawan, "shift")).body.data).toMatchObject({ scheduleMode: "shift", hasShifts: true });
    expect((await setMode(owner, ws.employeeIds.maya, "shift")).status).toBe(200);

    // Karyawan ikut jadwal usaha tidak bisa diroster
    expect((await put(owner, `/attendance/roster/${ws.employeeIds.budi}/2026-10-06`, { kind: "shift", shiftId: pagi })).status).toBe(409);

    // Owner: Dewi Pagi Sen–Sel, Malam Rab, libur Kam; Maya Pagi Sen
    for (const [date, body] of [
      ["2026-10-05", { kind: "shift", shiftId: pagi }],
      ["2026-10-06", { kind: "shift", shiftId: pagi }],
      ["2026-10-07", { kind: "shift", shiftId: malam }],
      ["2026-10-08", { kind: "off" }],
    ] as const) {
      const res = await put(owner, `/attendance/roster/${ws.employeeIds.karyawan}/${date}`, body);
      expect(res.status, JSON.stringify(res.body)).toBe(200);
    }
    expect((await put(owner, `/attendance/roster/${ws.employeeIds.maya}/2026-10-05`, { kind: "shift", shiftId: pagi })).status).toBe(200);
    expect(await pendingNotices(ws, ws.employeeIds.karyawan)).toBe(1);

    // Tanggal lewat & shift tidak dikenal ditolak
    expect((await put(owner, `/attendance/roster/${ws.employeeIds.karyawan}/2026-10-04`, { kind: "off" })).status).toBe(409);
    expect((await put(owner, `/attendance/roster/${ws.employeeIds.karyawan}/2026-10-09`, { kind: "shift", shiftId: randomUUID() })).status).toBe(404);

    // Sudah absen → terkunci
    await withTenant(db, { tenantId: ws.tenantId, userId: null }, (tx) =>
      tx.insert(attendanceRecords).values({
        tenantId: ws.tenantId,
        employeeId: ws.employeeIds.karyawan,
        workDate: "2026-10-05",
        timeZone: "Asia/Makassar",
        scheduledStart: "08:00",
        scheduledEnd: "17:00",
        checkInAt: new Date("2026-10-04T23:00:00Z"),
      }),
    );
    const attended = await put(owner, `/attendance/roster/${ws.employeeIds.karyawan}/2026-10-05`, { kind: "off" });
    expect(attended.status).toBe(409);
    expect(attended.body.error).toContain("sudah absen");

    // Minggu ini: hanya karyawan mode shift, isi & kunci sel
    const week = await get(owner, "/attendance/roster?week=2026-10-07");
    expect(week.status, JSON.stringify(week.body)).toBe(200);
    expect(week.body.data).toMatchObject({ weekStart: "2026-10-05", today: "2026-10-05", hasShifts: true, canManageShifts: true, businessModeCount: 2 });
    const dewi = week.body.data.employees.find((e: { id: string }) => e.id === ws.employeeIds.karyawan);
    expect(dewi.shiftCount).toBe(3);
    expect(dewi.cells.slice(0, 5)).toEqual([
      { date: "2026-10-05", entry: expect.objectContaining({ kind: "shift", name: "Pagi" }), lock: "attended" },
      { date: "2026-10-06", entry: expect.objectContaining({ kind: "shift", name: "Pagi", startTime: "07:00", endTime: "15:00" }), lock: null },
      { date: "2026-10-07", entry: expect.objectContaining({ kind: "shift", name: "Malam", overnight: true }), lock: null },
      { date: "2026-10-08", entry: { kind: "off" }, lock: null },
      { date: "2026-10-09", entry: null, lock: null },
    ]);
    const lastWeek = await get(owner, "/attendance/roster?week=2026-09-30");
    expect(lastWeek.body.data.employees[0].cells.every((cell: { lock: string }) => cell.lock === "past")).toBe(true);

    // Atasan: hanya bawahan langsung (Dewi); tidak bisa mengubah Maya
    const atasan = await tokenOf(ws, "atasan");
    const atasanWeek = await get(atasan, "/attendance/roster");
    expect(atasanWeek.body.data.employees.map((e: { id: string }) => e.id)).toEqual([ws.employeeIds.karyawan]);
    expect(atasanWeek.body.data.canManageShifts).toBe(false);
    expect((await put(atasan, `/attendance/roster/${ws.employeeIds.maya}/2026-10-06`, { kind: "off" })).status).toBe(404);
    expect((await put(atasan, `/attendance/roster/${ws.employeeIds.karyawan}/2026-10-09`, { kind: "shift", shiftId: pagi })).status).toBe(200);
    // Karyawan tidak boleh mengatur roster
    const karyawan = await tokenOf(ws, "karyawan");
    expect((await get(karyawan, "/attendance/roster")).status).toBe(403);

    // Kosongkan
    expect((await put(owner, `/attendance/roster/${ws.employeeIds.karyawan}/2026-10-09`, { kind: "clear" })).body.data).toEqual({ date: "2026-10-09", entry: null, lock: null });

    // Audit dari → ke
    const audit = await withTenant(db, { tenantId: ws.tenantId, userId: null }, (tx) =>
      tx
        .select({ before: auditLogs.before, after: auditLogs.after })
        .from(auditLogs)
        .where(and(eq(auditLogs.action, "update_roster"), eq(auditLogs.entityId, ws.employeeIds.karyawan))),
    );
    expect(audit).toEqual(
      expect.arrayContaining([
        { before: { date: "2026-10-07", entry: "—" }, after: { date: "2026-10-07", entry: "Malam 22:00–06:00 (+1)" } },
        { before: { date: "2026-10-09", entry: "Pagi 07:00–15:00" }, after: { date: "2026-10-09", entry: "—" } },
      ]),
    );

    // Jadwal saya: hari ini + 6 hari
    const mine = await get(karyawan, "/attendance/me/schedule");
    expect(mine.body.data).toMatchObject({ mode: "shift", today: "2026-10-05", timeZone: "Asia/Makassar" });
    expect(mine.body.data.days).toHaveLength(7);
    expect(mine.body.data.days.slice(0, 4).map((d: { entry: { kind: string; name?: string } | null }) => d.entry?.name ?? d.entry?.kind ?? null)).toEqual([
      "Pagi",
      "Pagi",
      "Malam",
      "off",
    ]);
    // Ikut jadwal usaha → kosong
    expect((await get(owner, "/attendance/me/schedule")).body.data).toMatchObject({ mode: "business", days: [] });
  });

  it("salin minggu lalu: hitung dulu, lalu isi; sel terkunci dilewati; isi lama ditimpa", async () => {
    const ws = await createWorkspace("Roster Salin");
    // Minggu lalu (Sen 28 Sep) diisi saat itu
    setNow("2026-09-28T01:00:00Z");
    let owner = await tokenOf(ws, "owner");
    const pagi = await createShift(owner, "Pagi", "07:00", "15:00");
    const siang = await createShift(owner, "Siang", "15:00", "23:00");
    await setMode(owner, ws.employeeIds.karyawan, "shift");
    await setMode(owner, ws.employeeIds.maya, "shift");
    for (const date of ["2026-09-28", "2026-09-29", "2026-09-30"]) {
      await put(owner, `/attendance/roster/${ws.employeeIds.karyawan}/${date}`, { kind: "shift", shiftId: pagi });
    }
    await put(owner, `/attendance/roster/${ws.employeeIds.karyawan}/2026-10-01`, { kind: "off" });
    await put(owner, `/attendance/roster/${ws.employeeIds.maya}/2026-09-28`, { kind: "shift", shiftId: siang });

    // Minggu ini (Rab 7 Okt): Sen–Sel sudah lewat; Rab Dewi sudah diisi Siang (akan ditimpa)
    setNow("2026-10-07T01:00:00Z");
    owner = await tokenOf(ws, "owner");
    await put(owner, `/attendance/roster/${ws.employeeIds.karyawan}/2026-10-07`, { kind: "shift", shiftId: siang });

    const preview = await post(owner, "/attendance/roster/copy-previous-week", { week: "2026-10-05", dryRun: true });
    expect(preview.status, JSON.stringify(preview.body)).toBe(200);
    expect(preview.body.data).toEqual({ filled: 2, overwritten: 1, skippedLocked: 3, skippedDeletedShift: 0, dryRun: true });
    expect((await rosterRows(ws, ws.employeeIds.karyawan)).filter((row) => row.workDate >= "2026-10-05")).toHaveLength(1);

    const copied = await post(owner, "/attendance/roster/copy-previous-week", { week: "2026-10-05" });
    expect(copied.body.data).toEqual({ filled: 2, overwritten: 1, skippedLocked: 3, skippedDeletedShift: 0, dryRun: false });
    const rows = (await rosterRows(ws, ws.employeeIds.karyawan)).filter((row) => row.workDate >= "2026-10-05");
    expect(rows.map((row) => [row.workDate, row.shiftName])).toEqual([
      ["2026-10-07", "Pagi"],
      ["2026-10-08", null],
    ]);
    const copyAudit = await withTenant(db, { tenantId: ws.tenantId, userId: null }, (tx) =>
      tx.select({ after: auditLogs.after }).from(auditLogs).where(and(eq(auditLogs.action, "copy_roster"), eq(auditLogs.entityId, ws.employeeIds.karyawan))),
    );
    expect(copyAudit).toEqual([{ after: [{ date: "2026-10-07", entry: "Pagi 07:00–15:00" }, { date: "2026-10-08", entry: "Libur" }] }]);
  });

  it("ubah jam shift memperbarui roster yang belum terkunci; hapus shift mengosongkannya, yang terkunci tetap snapshot", async () => {
    const ws = await createWorkspace("Roster Ubah Shift");
    setNow("2026-10-02T01:00:00Z");
    let owner = await tokenOf(ws, "owner");
    const pagi = await createShift(owner, "Pagi", "07:00", "15:00");
    await setMode(owner, ws.employeeIds.karyawan, "shift");
    for (const date of ["2026-10-02", "2026-10-05", "2026-10-06"]) {
      expect((await put(owner, `/attendance/roster/${ws.employeeIds.karyawan}/${date}`, { kind: "shift", shiftId: pagi })).status).toBe(200);
    }

    setNow(NOW);
    owner = await tokenOf(ws, "owner");
    const updated = await put(owner, `/attendance/shifts/${pagi}`, { name: "Pagi", startTime: "06:00", endTime: "14:00" });
    expect(updated.status, JSON.stringify(updated.body)).toBe(200);
    expect(updated.body.data).toMatchObject({ startTime: "06:00", upcomingAssignments: 2, employeesThisWeek: 1 });
    expect((await rosterRows(ws, ws.employeeIds.karyawan)).map((row) => [row.workDate, row.startTime])).toEqual([
      ["2026-10-02", "07:00:00"],
      ["2026-10-05", "06:00:00"],
      ["2026-10-06", "06:00:00"],
    ]);

    expect((await del(owner, `/attendance/shifts/${pagi}`)).status).toBe(200);
    expect(await rosterRows(ws, ws.employeeIds.karyawan)).toEqual([{ workDate: "2026-10-02", workShiftId: null, shiftName: "Pagi", startTime: "07:00:00" }]);
    const shifts = await withTenant(db, { tenantId: ws.tenantId, userId: null }, (tx) => tx.select({ id: workShifts.id }).from(workShifts));
    expect(shifts).toEqual([]);
  });
});

describe("isolasi tenant", () => {
  it("shift & roster usaha lain tidak terlihat dan tidak bisa dipakai", async () => {
    const a = await createWorkspace("Roster Iso A");
    const b = await createWorkspace("Roster Iso B");
    setNow(NOW);
    const ownerA = await tokenOf(a, "owner");
    const ownerB = await tokenOf(b, "owner");
    const shiftA = await createShift(ownerA, "Pagi", "07:00", "15:00");
    await setMode(ownerA, a.employeeIds.karyawan, "shift");
    await put(ownerA, `/attendance/roster/${a.employeeIds.karyawan}/2026-10-06`, { kind: "shift", shiftId: shiftA });

    await createShift(ownerB, "Pagi", "07:00", "15:00");
    await setMode(ownerB, b.employeeIds.karyawan, "shift");
    expect((await get(ownerB, "/attendance/shifts")).body.data.items).toHaveLength(1);
    expect((await put(ownerB, `/attendance/shifts/${shiftA}`, { name: "X", startTime: "08:00", endTime: "16:00" })).status).toBe(404);
    expect((await put(ownerB, `/attendance/roster/${a.employeeIds.karyawan}/2026-10-07`, { kind: "off" })).status).toBe(404);
    // Shift usaha A tidak bisa dipakai di roster usaha B
    expect((await put(ownerB, `/attendance/roster/${b.employeeIds.karyawan}/2026-10-07`, { kind: "shift", shiftId: shiftA })).status).toBe(404);
    expect((await get(ownerB, "/attendance/roster")).body.data.employees.map((e: { id: string }) => e.id)).toEqual([b.employeeIds.karyawan]);

    const fromB = await withTenant(db, { tenantId: b.tenantId, userId: null }, (tx) => tx.select({ id: shiftRosterDays.id }).from(shiftRosterDays));
    expect(fromB).toEqual([]);
    await expect(
      withTenant(db, { tenantId: b.tenantId, userId: null }, (tx) =>
        tx.insert(shiftRosterDays).values({ tenantId: a.tenantId, employeeId: a.employeeIds.karyawan, workDate: "2026-10-09" }),
      ),
    ).rejects.toThrow();
  });
});

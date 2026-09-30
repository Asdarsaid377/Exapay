import "reflect-metadata";
import { randomUUID } from "node:crypto";

import * as schema from "@exapay/db";
import { attendanceRecords, departments, employees, leaveRequests, memberships, positions, taskLogs, tenants, users } from "@exapay/db";
import type { MembershipRole, TaskLogStatus } from "@exapay/shared";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { hash } from "@node-rs/argon2";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, inject, it, vi } from "vitest";

import { AppModule } from "../src/app.module.js";
import { configureApp } from "../src/app.setup.js";
import { type Database, withTenant, withUser } from "../src/database/tenant-transaction.js";
import { seedTenantDefaults } from "../src/modules/tenants/tenant-defaults.js";

// Verifikasi feature 21 (API): skor ad-hoc dari catatan tugas terverifikasi + rekap absensi; cakupan owner/admin vs atasan;
// filter tim (departemen); periode dipotong sampai hari ini; skor milik sendiri di portal.

const PASSWORD = "password-score-123";
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
  otherDepartmentId: string;
  otherPositionId: string;
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
    const [other] = await tx.insert(departments).values({ tenantId, name: "Gudang" }).returning({ id: departments.id });
    const [position] = await tx.insert(positions).values({ tenantId, name: "Barista" }).returning({ id: positions.id });
    const [otherPosition] = await tx.insert(positions).values({ tenantId, name: "Staf gudang" }).returning({ id: positions.id });
    if (!department || !other || !position || !otherPosition) throw new Error("gagal membuat departemen/jabatan");
    return { departmentId: department.id, positionId: position.id, otherDepartmentId: other.id, otherPositionId: otherPosition.id };
  });
  return { tenantId, userIds, emails, ...ids };
}

type EmployeeOptions = { userId?: string | null; supervisorId?: string | null; fullName: string; departmentId: string; positionId: string };

async function addEmployee(ws: Workspace, options: EmployeeOptions): Promise<string> {
  const id = randomUUID();
  await withTenant(db, { tenantId: ws.tenantId, userId: null }, (tx) =>
    tx.insert(employees).values({
      id,
      tenantId: ws.tenantId,
      fullName: options.fullName,
      departmentId: options.departmentId,
      positionId: options.positionId,
      supervisorId: options.supervisorId ?? null,
      userId: options.userId ?? null,
      joinDate: "2025-01-01",
      employmentStatus: "permanent",
      ptkpStatus: "TK/0",
    }),
  );
  return id;
}

async function checkIn(ws: Workspace, employeeId: string, workDate: string): Promise<void> {
  await withTenant(db, { tenantId: ws.tenantId, userId: null }, (tx) =>
    tx.insert(attendanceRecords).values({
      tenantId: ws.tenantId,
      employeeId,
      workDate,
      timeZone: "Asia/Jakarta",
      scheduledStart: "08:00",
      scheduledEnd: "17:00",
      checkInAt: new Date(Date.parse(`${workDate}T07:55:00+07:00`)),
    }),
  );
}

async function approvedSick(ws: Workspace, employeeId: string, date: string): Promise<void> {
  await withTenant(db, { tenantId: ws.tenantId, userId: null }, (tx) =>
    tx.insert(leaveRequests).values({ tenantId: ws.tenantId, employeeId, type: "sick", startDate: date, endDate: date, reason: "Demam", status: "approved", decidedAt: new Date() }),
  );
}

// Catatan tugas dengan keputusan atasan langsung (tanpa melewati endpoint verifikasi — diuji di feature 20)
async function insertLog(ws: Workspace, employeeId: string, workDate: string, indicatorId: string, quantity: string, status: TaskLogStatus, verified?: string): Promise<void> {
  const decided = status !== "pending";
  await withTenant(db, { tenantId: ws.tenantId, userId: null }, (tx) =>
    tx.insert(taskLogs).values({
      tenantId: ws.tenantId,
      employeeId,
      workDate,
      indicatorId,
      quantity,
      status,
      verifiedQuantity: status === "approved" ? (verified ?? quantity) : null,
      decidedAt: decided ? new Date() : null,
      decisionNote: status === "rejected" || (verified !== undefined && verified !== quantity) ? "Sesuai struk kasir" : null,
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

// Template Barista: cup 10/hari (60%), kehadiran 95% (30%), sikap kerja dinilai atasan (10%)
async function createTemplate(ws: Workspace, owner: string): Promise<string> {
  const created = await request(server)
    .post("/kpi/templates")
    .set("Authorization", `Bearer ${owner}`)
    .send({
      name: "Barista skor",
      description: null,
      positionIds: [ws.positionId],
      indicators: [
        { name: "Cup terjual", type: "count", unit: "cup", target: "10", targetPeriod: "daily", weight: 60 },
        { name: "Kehadiran", type: "system", systemMetric: "attendance_rate", target: "95", weight: 30 },
        { name: "Sikap kerja", type: "rating", weight: 10 },
      ],
    });
  expect(created.status, JSON.stringify(created.body)).toBe(201);
  const overview = await get(owner, "/kpi/templates");
  const template = overview.body.data.templates.find((candidate: { id: string }) => candidate.id === created.body.data.id);
  return template.indicators.find((indicator: { name: string }) => indicator.name === "Cup terjual").id;
}

type Row = { employee: { id: string; fullName: string }; template: { name: string } | null; result: Record<string, unknown> | null };

function rowOf(rows: Row[], employeeId: string): Row {
  const row = rows.find((candidate) => candidate.employee.id === employeeId);
  if (!row) throw new Error(`karyawan ${employeeId} tidak ada di daftar skor`);
  return row;
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

describe("skor KPI ad-hoc", () => {
  it("skor dari catatan terverifikasi + absensi; cakupan peran; filter tim; periode sampai hari ini; skor sendiri", async () => {
    setNow();
    const ws = await createWorkspace("Kopi Skor");
    const supervisor = await addEmployee(ws, { userId: ws.userIds.atasan, fullName: "Andi Atasan", departmentId: ws.departmentId, positionId: ws.otherPositionId });
    const barista = await addEmployee(ws, {
      userId: ws.userIds.karyawan,
      supervisorId: supervisor,
      fullName: "Dewi Barista",
      departmentId: ws.departmentId,
      positionId: ws.positionId,
    });
    // Tanpa template (jabatan staf gudang), departemen lain, tanpa atasan
    const warehouse = await addEmployee(ws, { fullName: "Siti Gudang", departmentId: ws.otherDepartmentId, positionId: ws.otherPositionId });

    const owner = await tokenOf(ws, "owner");
    const atasan = await tokenOf(ws, "atasan");
    const karyawan = await tokenOf(ws, "karyawan");
    const cups = await createTemplate(ws, owner);

    // 5 Okt hadir · 6 Okt alpa · 7 Okt sakit disetujui · 8 & 9 Okt hadir (9 = hari ini)
    for (const date of ["2026-10-05", "2026-10-08", "2026-10-09"]) await checkIn(ws, barista, date);
    await approvedSick(ws, barista, "2026-10-07");
    await insertLog(ws, barista, "2026-10-05", cups, "12", "approved");
    // Dikoreksi atasan 20 → 15; hanya angka koreksi yang dihitung
    await insertLog(ws, barista, "2026-10-08", cups, "20", "approved", "15");
    await insertLog(ws, barista, "2026-10-08", cups, "5", "rejected");
    await insertLog(ws, barista, "2026-10-09", cups, "10", "pending");

    const res = await get(owner, "/kpi/scores?from=2026-10-05&to=2026-10-09");
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const list = res.body.data;
    expect(list).toMatchObject({ from: "2026-10-05", to: "2026-10-09", today: "2026-10-09", scope: "all", departmentId: null });
    expect(list.rows.map((row: Row) => row.employee.fullName)).toEqual(["Andi Atasan", "Dewi Barista", "Siti Gudang"]);
    expect(rowOf(list.rows, warehouse)).toMatchObject({ template: null, result: null });

    // Hari target 4 (5, 6, 8, 9) · cup 27 ÷ 40 = 67,5% → 40,5 poin · kehadiran 3 ÷ 4 = 75% ÷ 95% = 78,9% → 23,67 poin
    // Sikap kerja belum dinilai → pembagi 90: (40,5 + 23,67) ÷ 90 × 100 = 71,3 (Cukup)
    const scored = rowOf(list.rows, barista);
    expect(scored.template).toMatchObject({ name: "Barista skor" });
    expect(scored.result).toMatchObject({
      score: "71.3",
      predicate: "fair",
      pointTotal: "64.17",
      countedWeight: 90,
      days: { targetDays: 4, present: 3, absent: 1, leaveDays: 1 },
    });
    expect((scored.result?.indicators as Record<string, unknown>[]).map((i) => [i.name, i.periodTarget, i.actual, i.achievement, i.points, i.status])).toEqual([
      ["Cup terjual", "40", "27", "67.5", "40.5", "scored"],
      ["Kehadiran", "95", "75", "78.9", "23.67", "scored"],
      ["Sikap kerja", "5", null, null, null, "not_rated"],
    ]);
    expect(list).toMatchObject({ averageScore: "71.3", averagePredicate: "fair" });
    expect(list.predicateCounts).toEqual({ very_good: 0, good: 0, fair: 1, needs_improvement: 0 });
    expect(list.departments).toEqual([
      { id: ws.otherDepartmentId, name: "Gudang" },
      { id: ws.departmentId, name: "Operasional" },
    ]);

    // Filter tim
    const team = await get(owner, `/kpi/scores?from=2026-10-05&to=2026-10-09&departmentId=${ws.otherDepartmentId}`);
    expect(team.body.data.departmentId).toBe(ws.otherDepartmentId);
    expect(team.body.data.rows.map((row: Row) => row.employee.id)).toEqual([warehouse]);
    expect(team.body.data.averageScore).toBeNull();

    // Atasan: hanya bawahan langsung; karyawan tidak boleh
    const supervised = await get(atasan, "/kpi/scores?from=2026-10-05&to=2026-10-09");
    expect(supervised.status).toBe(200);
    expect(supervised.body.data.scope).toBe("subordinates");
    expect(supervised.body.data.rows.map((row: Row) => row.employee.id)).toEqual([barista]);
    expect((await get(karyawan, "/kpi/scores")).status).toBe(403);

    // Bulan berjalan dipotong sampai hari ini; periode yang belum mulai ditolak
    const month = await get(owner, "/kpi/scores");
    expect(month.body.data).toMatchObject({ from: "2026-10-01", to: "2026-10-09", requestedTo: "2026-10-31" });
    const future = await get(owner, "/kpi/scores?from=2026-10-12&to=2026-10-16");
    expect(future.status).toBe(400);

    // Portal: bulan berjalan — 1, 2, 6 Okt alpa → hari target 6, cup 27 ÷ 60 = 45% → 27 poin; kehadiran 3 ÷ 6 = 50% ÷ 95% = 52,6% → 15,78 poin
    // (27 + 15,78) ÷ 90 × 100 = 47,5 (Perlu Perbaikan)
    const mine = await get(karyawan, "/kpi/scores/me");
    expect(mine.status, JSON.stringify(mine.body)).toBe(200);
    expect(mine.body.data).toMatchObject({
      access: "ok",
      month: "2026-10",
      currentMonth: "2026-10",
      from: "2026-10-01",
      to: "2026-10-09",
      template: { name: "Barista skor" },
      result: { score: "47.5", predicate: "needs_improvement", days: { targetDays: 6, present: 3, absent: 3, leaveDays: 1 } },
    });
    // Bulan sebelumnya: tanpa absen sama sekali → semua hari kerja September alpa
    const september = await get(karyawan, "/kpi/scores/me?month=2026-09");
    expect(september.body.data).toMatchObject({ month: "2026-09", from: "2026-09-01", to: "2026-09-30", result: { days: { targetDays: 22, absent: 22 } } });
    // Akun tanpa data karyawan
    const unlinked = await get(owner, "/kpi/scores/me");
    expect(unlinked.body.data).toMatchObject({ access: "not_linked", template: null, result: null });
  });
});

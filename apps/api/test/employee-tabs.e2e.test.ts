import "reflect-metadata";
import { randomUUID } from "node:crypto";

import * as schema from "@exapay/db";
import { attendanceRecords, departments, memberships, positions, taskLogs, tenants, users } from "@exapay/db";
import type { MembershipRole } from "@exapay/shared";
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

// Verifikasi feature 37b (tab KPI & Absensi detail karyawan): skor per karyawan = /kpi/scores, riwayat penilaian semua status
// (skor hanya final), rincian absensi membawa bulan payroll; atasan hanya bawahan langsung, karyawan ditolak.

const PASSWORD = "password-tab-123";
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

async function login(email: string, password: string): Promise<request.Response> {
  return request(server).post("/auth/login").send({ email, password, client: "mobile" });
}

async function tokenOf(ws: Workspace, role: MembershipRole): Promise<string> {
  const res = await login(ws.emails[role], PASSWORD);
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body.data.tokens.accessToken;
}

function get(token: string, path: string): request.Test {
  return request(server).get(path).set("Authorization", `Bearer ${token}`);
}

function send(token: string, method: "post" | "put", path: string, body: object): request.Test {
  return request(server)[method](path).set("Authorization", `Bearer ${token}`).send(body);
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

function employeeInput(ws: Workspace, overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    fullName: "Karyawan",
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
    ...overrides,
  };
}

async function createEmployee(ws: Workspace, owner: string, overrides: Record<string, unknown>): Promise<string> {
  const res = await send(owner, "post", "/employees", employeeInput(ws, overrides));
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body.data.id;
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

describe("tab KPI & Absensi detail karyawan", () => {
  it("angka cocok dengan halaman sumber; cakupan atasan; riwayat penilaian", async () => {
    setNow();
    const ws = await createWorkspace("Kopi Tab");
    const owner = await tokenOf(ws, "owner");
    const atasan = await tokenOf(ws, "atasan");
    const karyawan = await tokenOf(ws, "karyawan");

    const supervisor = await createEmployee(ws, owner, { fullName: "Andi Atasan", userId: ws.userIds.atasan });
    const dewi = await createEmployee(ws, owner, { fullName: "Dewi Barista", supervisorId: supervisor, userId: ws.userIds.karyawan });
    const budi = await createEmployee(ws, owner, { fullName: "Budi Barista" });

    const template = await send(owner, "post", "/kpi/templates", {
      name: "Barista tab",
      description: null,
      positionIds: [ws.positionId],
      indicators: [
        { name: "Cup terjual", type: "count", unit: "cup", target: "10", targetPeriod: "daily", weight: 70 },
        { name: "Kehadiran", type: "system", systemMetric: "attendance_rate", target: "95", weight: 30 },
      ],
    });
    expect(template.status, JSON.stringify(template.body)).toBe(201);
    const indicatorId: string = (await get(owner, "/kpi/templates")).body.data.templates[0].indicators[0].id;
    for (const date of ["2026-09-01", "2026-09-02", "2026-09-03"]) await checkIn(ws, dewi, date);
    await withTenant(db, { tenantId: ws.tenantId, userId: null }, (tx) =>
      tx.insert(taskLogs).values({ tenantId: ws.tenantId, employeeId: dewi, workDate: "2026-09-01", indicatorId, quantity: "40", status: "approved", verifiedQuantity: "40", decidedAt: new Date() }),
    );

    // ——— Skor: sama dengan /kpi/scores bulan itu
    const score = await get(owner, `/kpi/employees/${dewi}/score?month=2026-09`);
    expect(score.status, JSON.stringify(score.body)).toBe(200);
    const list = (await get(owner, "/kpi/scores?month=2026-09")).body.data;
    const row = list.rows.find((candidate: { employee: { id: string } }) => candidate.employee.id === dewi);
    expect(score.body.data).toMatchObject({ month: "2026-09", currentMonth: "2026-10", from: "2026-09-01", to: "2026-09-30", template: { name: "Barista tab" } });
    expect(score.body.data.result).toEqual(row.result);
    // Tanpa bulan → bulan berjalan s.d. hari ini; bulan depan dibatasi ke bulan berjalan
    expect((await get(owner, `/kpi/employees/${dewi}/score`)).body.data).toMatchObject({ month: "2026-10", to: "2026-10-09" });
    expect((await get(owner, `/kpi/employees/${dewi}/score?month=2026-12`)).body.data.month).toBe("2026-10");

    // ——— Cakupan: atasan hanya bawahan langsung; karyawan ditolak; id asal 404
    expect((await get(atasan, `/kpi/employees/${dewi}/score?month=2026-09`)).body.data.result).toEqual(row.result);
    expect((await get(atasan, `/kpi/employees/${budi}/score`)).status).toBe(404);
    expect((await get(atasan, `/kpi/employees/${budi}/reviews`)).status).toBe(404);
    expect((await get(atasan, `/attendance/recap/${budi}`)).status).toBe(404);
    expect((await get(karyawan, `/kpi/employees/${dewi}/score`)).status).toBe(403);
    expect((await get(karyawan, `/kpi/employees/${dewi}/reviews`)).status).toBe(403);
    expect((await get(owner, "/kpi/employees/bukan-uuid/score")).status).toBe(404);

    // ——— Riwayat penilaian: semua status, skor hanya final
    expect((await get(owner, `/kpi/employees/${dewi}/reviews`)).body.data).toEqual([]);
    const created = await send(owner, "post", "/kpi/reviews", { startDate: "2026-09-01" });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const reviewRow = (await get(owner, `/kpi/reviews?period=${created.body.data.periodId}`)).body.data.rows.find(
      (candidate: { employee: { id: string } }) => candidate.employee.id === dewi,
    );
    const draft = await get(atasan, `/kpi/employees/${dewi}/reviews`);
    expect(draft.status, JSON.stringify(draft.body)).toBe(200);
    expect(draft.body.data).toEqual([
      { id: reviewRow.id, status: "draft", period: { cycle: "monthly", startDate: "2026-09-01", endDate: "2026-09-30" }, score: null, predicate: null },
    ]);
    let detail = (await get(atasan, `/kpi/reviews/${reviewRow.id}`)).body.data;
    expect((await send(atasan, "put", `/kpi/reviews/${reviewRow.id}/ratings`, { version: detail.version, ratings: [], submit: true })).status).toBe(200);
    detail = (await get(owner, `/kpi/reviews/${reviewRow.id}`)).body.data;
    expect((await send(owner, "post", `/kpi/reviews/${reviewRow.id}/status`, { action: "finalize", version: detail.version })).status).toBe(200);
    const final = (await get(owner, `/kpi/employees/${dewi}/reviews`)).body.data;
    expect(final[0]).toMatchObject({ status: "final", score: detail.result.score, predicate: detail.result.predicate });

    // ——— Absensi: rincian harian membawa bulan payroll terpilih & bulan berjalan
    const days = await get(owner, `/attendance/recap/${dewi}?month=2026-09`);
    expect(days.status, JSON.stringify(days.body)).toBe(200);
    expect(days.body.data).toMatchObject({ month: "2026-09", currentMonth: "2026-10", from: "2026-09-01", to: "2026-09-30", summary: { present: 3 } });
    expect((await get(owner, `/attendance/recap/${dewi}?from=2026-09-01&to=2026-09-10`)).body.data).toMatchObject({ month: null, currentMonth: "2026-10" });
  });
});

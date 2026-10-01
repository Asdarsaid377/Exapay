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

// Verifikasi feature 37 (API portal karyawan): profil milik sendiri (tersamar, tanpa catatan internal, akses nonaktif),
// penilaian KPI milik sendiri hanya yang final (+ narasi yang ditinjau), alpa di riwayat absensi portal, ganti password
// (password lama wajib benar, sesi lain diakhiri, sesi ini tetap).

const PASSWORD = "password-portal-123";
const NEW_PASSWORD = "password-portal-baru-456";
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

describe("portal karyawan", () => {
  it("profil sendiri, penilaian final saja, alpa bulan ini, akses nonaktif", async () => {
    setNow();
    const ws = await createWorkspace("Kopi Portal");
    const owner = await tokenOf(ws, "owner");
    const atasan = await tokenOf(ws, "atasan");
    const karyawan = await tokenOf(ws, "karyawan");

    const supervisor = await createEmployee(ws, owner, { fullName: "Andi Atasan", userId: ws.userIds.atasan });
    const dewi = await createEmployee(ws, owner, {
      fullName: "Dewi Barista",
      employeeNumber: "KP-007",
      phone: "081234567890",
      supervisorId: supervisor,
      userId: ws.userIds.karyawan,
      nik: "7371055708980004",
      npwp: "092547816805000",
      bankCode: "BCA",
      bankAccountNumber: "1234564821",
      bankAccountHolder: "Dewi Barista",
    });

    // ——— Profil: akun tanpa data karyawan; karyawan melihat data sendiri tersamar
    expect((await get(owner, "/employees/me")).body.data).toEqual({ access: "not_linked" });
    const profile = await get(karyawan, "/employees/me");
    expect(profile.status, JSON.stringify(profile.body)).toBe(200);
    expect(profile.body.data).toMatchObject({
      access: "ok",
      employee: {
        id: dewi,
        fullName: "Dewi Barista",
        employeeNumber: "KP-007",
        phone: "081234567890",
        supervisor: { id: supervisor, fullName: "Andi Atasan" },
        position: { name: "Barista" },
        confidential: { ptkpStatus: "TK/0", nikMasked: "7371 •••• •••• 0004", bankCode: "BCA", bankAccountMasked: "•••• •••• 4821", bankAccountHolder: "Dewi Barista" },
      },
    });
    expect(profile.body.data.employee.confidential.npwpMasked).toMatch(/000$/);
    expect(JSON.stringify(profile.body.data)).not.toContain("1234564821");
    expect(profile.body.data.employee).not.toHaveProperty("endReason");
    expect(profile.body.data.employee).not.toHaveProperty("canManage");
    // /employees/me tidak tertangkap /employees/:id
    expect((await get(atasan, "/employees/me")).body.data).toMatchObject({ access: "ok", employee: { id: supervisor } });

    // ——— Alpa di riwayat portal: Okt 1–8 ada 6 hari kerja sebelum hari ini; hadir 2 → alpa 4 (hari ini belum dihitung)
    await checkIn(ws, dewi, "2026-10-01");
    await checkIn(ws, dewi, "2026-10-02");
    const history = await get(karyawan, "/attendance/me/history");
    expect(history.status, JSON.stringify(history.body)).toBe(200);
    expect(history.body.data.summary).toEqual({ present: 2, late: 0, lateMinutes: 0, absent: 4 });
    expect((await get(owner, "/attendance/me/history")).body.data).toMatchObject({ access: "not_linked", summary: { present: 0, absent: 0 } });

    // ——— Penilaian: hanya final yang terlihat karyawan
    const template = await send(owner, "post", "/kpi/templates", {
      name: "Barista portal",
      description: null,
      positionIds: [ws.positionId],
      indicators: [{ name: "Cup terjual", type: "count", unit: "cup", target: "10", targetPeriod: "daily", weight: 100 }],
    });
    expect(template.status, JSON.stringify(template.body)).toBe(201);
    const indicatorId: string = (await get(owner, "/kpi/templates")).body.data.templates[0].indicators[0].id;
    await checkIn(ws, dewi, "2026-09-01");
    await withTenant(db, { tenantId: ws.tenantId, userId: null }, (tx) =>
      tx.insert(taskLogs).values({
        tenantId: ws.tenantId,
        employeeId: dewi,
        workDate: "2026-09-01",
        indicatorId,
        quantity: "110",
        status: "approved",
        verifiedQuantity: "110",
        decidedAt: new Date(),
      }),
    );
    const created = await send(owner, "post", "/kpi/reviews", { startDate: "2026-09-01" });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const list = (await get(owner, `/kpi/reviews?period=${created.body.data.periodId}`)).body.data;
    const reviewId: string = list.rows.find((row: { employee: { id: string } }) => row.employee.id === dewi).id;

    let detail = (await get(atasan, `/kpi/reviews/${reviewId}`)).body.data;
    expect((await send(atasan, "put", `/kpi/reviews/${reviewId}/ratings`, { version: detail.version, ratings: [], submit: true })).status).toBe(200);
    // Narasi ditulis owner (simpan = sudah ditinjau)
    detail = (await get(owner, `/kpi/reviews/${reviewId}`)).body.data;
    const narrated = await send(owner, "put", `/kpi/reviews/${reviewId}/summary`, { version: detail.summary.version, body: "Penjualan Dewi baik.\n\nPertahankan." });
    expect(narrated.status, JSON.stringify(narrated.body)).toBe(200);
    // Status reviewed belum terlihat karyawan
    expect((await get(karyawan, "/kpi/me/reviews")).body.data).toEqual({ access: "ok", reviews: [] });

    detail = (await get(owner, `/kpi/reviews/${reviewId}`)).body.data;
    const finalized = await send(owner, "post", `/kpi/reviews/${reviewId}/status`, { action: "finalize", version: detail.version });
    expect(finalized.status, JSON.stringify(finalized.body)).toBe(200);
    const mine = await get(karyawan, "/kpi/me/reviews");
    expect(mine.status, JSON.stringify(mine.body)).toBe(200);
    expect(mine.body.data.reviews).toHaveLength(1);
    expect(mine.body.data.reviews[0]).toMatchObject({
      id: reviewId,
      period: { cycle: "monthly", startDate: "2026-09-01", endDate: "2026-09-30" },
      templateName: "Barista portal",
      result: { score: detail.result.score, predicate: detail.result.predicate },
      summary: { body: "Penjualan Dewi baik.\n\nPertahankan." },
    });
    expect(mine.body.data.reviews[0].summary).not.toHaveProperty("model");
    // Penilaian karyawan lain tidak ikut; akun tanpa data karyawan
    expect((await get(atasan, "/kpi/me/reviews")).body.data).toEqual({ access: "ok", reviews: [] });
    expect((await get(owner, "/kpi/me/reviews")).body.data).toEqual({ access: "not_linked" });

    // ——— Nonaktif: profil tetap terbuka (access inactive), absen ditolak, slip & penilaian final tetap bisa dibaca
    const off = await send(owner, "post", `/employees/${dewi}/deactivate`, { endDate: "2026-10-08", endReason: "Catatan internal admin" });
    expect(off.status, JSON.stringify(off.body)).toBe(200);
    const inactive = await get(karyawan, "/employees/me");
    expect(inactive.body.data).toMatchObject({ access: "inactive", employee: { endDate: "2026-10-08" } });
    expect(JSON.stringify(inactive.body.data)).not.toContain("Catatan internal admin");
    expect((await send(karyawan, "post", "/attendance/me/check-in", { location: null })).status).toBe(403);
    expect((await get(karyawan, "/payroll/me/payslips")).body.data).toEqual({ access: "ok", payslips: [] });
    expect((await get(karyawan, "/kpi/me/reviews")).body.data.reviews).toHaveLength(1);
  });
});

describe("ganti password", () => {
  it("password lama wajib benar, sesi lain diakhiri, sesi ini tetap", async () => {
    const ws = await createWorkspace("Kopi Password");
    const email = ws.emails.karyawan;
    const current = (await login(email, PASSWORD)).body.data.tokens;
    const other = (await login(email, PASSWORD)).body.data.tokens;

    expect((await request(server).post("/auth/change-password").send({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD })).status).toBe(401);
    const wrong = await send(current.accessToken, "post", "/auth/change-password", { currentPassword: "salah-sekali", newPassword: NEW_PASSWORD });
    expect(wrong.status).toBe(400);
    expect(wrong.body.error).toBe("Password saat ini salah");
    expect((await send(current.accessToken, "post", "/auth/change-password", { currentPassword: PASSWORD, newPassword: PASSWORD })).status).toBe(400);
    expect((await send(current.accessToken, "post", "/auth/change-password", { currentPassword: PASSWORD, newPassword: "pendek" })).status).toBe(400);

    const changed = await send(current.accessToken, "post", "/auth/change-password", {
      currentPassword: PASSWORD,
      newPassword: NEW_PASSWORD,
      refreshToken: current.refreshToken,
    });
    expect(changed.status, JSON.stringify(changed.body)).toBe(200);

    // Sesi lain dicabut; sesi yang dipakai tetap bisa di-refresh
    expect((await request(server).post("/auth/refresh").send({ client: "mobile", refreshToken: other.refreshToken })).status).toBe(401);
    expect((await request(server).post("/auth/refresh").send({ client: "mobile", refreshToken: current.refreshToken })).status).toBe(200);
    expect((await login(email, PASSWORD)).status).toBe(401);
    expect((await login(email, NEW_PASSWORD)).status).toBe(200);
  });
});

import "reflect-metadata";
import { randomUUID } from "node:crypto";

import * as schema from "@exapay/db";
import { attendanceRecords, auditLogs, departments, employees, kpiReviews, memberships, positions, taskLogs, tenants, users } from "@exapay/db";
import type { MembershipRole, TaskLogStatus } from "@exapay/shared";
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

// Verifikasi feature 22 (API): siklus penilaian per usaha; buat periode (hanya yang sudah berakhir, tidak beririsan, tambah karyawan
// yang belum ada); nilai atasan; draft → direview → final (kembalikan ke draf); cakupan peran; tidak menilai diri sendiri;
// final terkunci — perubahan catatan tugas sesudahnya tidak mengubah skor final.

const PASSWORD = "password-review-123";
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

type EmployeeOptions = { userId?: string | null; supervisorId?: string | null; fullName: string; departmentId: string; positionId: string; joinDate?: string };

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
      joinDate: options.joinDate ?? "2025-01-01",
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

function send(token: string, method: "post" | "put", path: string, body: object): request.Test {
  return request(server)[method](path).set("Authorization", `Bearer ${token}`).send(body);
}

// Hari kerja September 2026 (Senin–Jumat, tanpa libur nasional): 22 hari
function septemberWorkdays(): string[] {
  const dates: string[] = [];
  for (let day = 1; day <= 30; day += 1) {
    const date = `2026-09-${String(day).padStart(2, "0")}`;
    const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
    if (weekday !== 0 && weekday !== 6) dates.push(date);
  }
  return dates;
}

type ListRow = { id: string; status: string; employee: { id: string; fullName: string }; score: string | null; unratedCount: number };

function reviewOf(rows: ListRow[], employeeId: string): ListRow {
  const row = rows.find((candidate) => candidate.employee.id === employeeId);
  if (!row) throw new Error(`karyawan ${employeeId} tidak ada di daftar penilaian`);
  return row;
}

// Template Barista: cup 10/hari (60%), kehadiran 95% (30%), sikap kerja dinilai atasan (10%)
async function createTemplate(ws: Workspace, owner: string): Promise<{ cups: string; attitude: string }> {
  const created = await request(server)
    .post("/kpi/templates")
    .set("Authorization", `Bearer ${owner}`)
    .send({
      name: "Barista penilaian",
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
  const idOf = (name: string): string => template.indicators.find((indicator: { name: string }) => indicator.name === name).id;
  return { cups: idOf("Cup terjual"), attitude: idOf("Sikap kerja") };
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


describe("siklus & penilaian KPI periodik", () => {
  it("siklus, buat periode, nilai atasan, alur status, cakupan, final terkunci", async () => {
    setNow();
    const ws = await createWorkspace("Kopi Penilaian");
    const supervisor = await addEmployee(ws, { userId: ws.userIds.atasan, fullName: "Andi Atasan", departmentId: ws.departmentId, positionId: ws.otherPositionId });
    const dewi = await addEmployee(ws, { userId: ws.userIds.karyawan, supervisorId: supervisor, fullName: "Dewi Barista", departmentId: ws.departmentId, positionId: ws.positionId });
    // Tanpa atasan → dinilai owner/admin
    const budi = await addEmployee(ws, { fullName: "Budi Barista", departmentId: ws.departmentId, positionId: ws.positionId });
    // Akun admin tertaut karyawan ber-template → tidak boleh menilai dirinya sendiri
    const rina = await addEmployee(ws, { userId: ws.userIds.admin, fullName: "Rina Admin", departmentId: ws.departmentId, positionId: ws.positionId });
    // Tanpa template (jabatan staf gudang)
    await addEmployee(ws, { fullName: "Siti Gudang", departmentId: ws.otherDepartmentId, positionId: ws.otherPositionId });

    const owner = await tokenOf(ws, "owner");
    const admin = await tokenOf(ws, "admin");
    const atasan = await tokenOf(ws, "atasan");
    const karyawan = await tokenOf(ws, "karyawan");
    const { cups, attitude } = await createTemplate(ws, owner);

    // ——— Siklus: default bulanan; hanya owner/admin
    const settings = await get(owner, "/kpi/settings");
    expect(settings.status, JSON.stringify(settings.body)).toBe(200);
    expect(settings.body.data).toEqual({ reviewCycle: "monthly", currentPeriod: { startDate: "2026-10-01", endDate: "2026-10-31" } });
    expect((await send(atasan, "put", "/kpi/settings", { reviewCycle: "weekly" })).status).toBe(403);
    const weekly = await send(admin, "put", "/kpi/settings", { reviewCycle: "weekly" });
    expect(weekly.body.data).toEqual({ reviewCycle: "weekly", currentPeriod: { startDate: "2026-10-05", endDate: "2026-10-11" } });
    expect((await send(owner, "put", "/kpi/settings", { reviewCycle: "yearly" })).status).toBe(400);
    await send(owner, "put", "/kpi/settings", { reviewCycle: "monthly" });

    // Dewi hadir semua 22 hari kerja September, 176 cup disetujui (target 220)
    for (const date of septemberWorkdays()) await checkIn(ws, dewi, date);
    await insertLog(ws, dewi, "2026-09-01", cups, "176", "approved");

    // ——— Buat periode
    const empty = await get(owner, "/kpi/reviews");
    expect(empty.status, JSON.stringify(empty.body)).toBe(200);
    expect(empty.body.data).toMatchObject({ scope: "all", cycle: "monthly", today: "2026-10-09", periods: [], period: null, rows: [], missingCount: 0 });
    expect(empty.body.data.candidates[0]).toEqual({ startDate: "2026-09-01", endDate: "2026-09-30" });

    expect((await send(owner, "post", "/kpi/reviews", { startDate: "2026-10-01" })).status).toBe(400); // belum berakhir
    expect((await send(owner, "post", "/kpi/reviews", { startDate: "2026-09-02" })).status).toBe(400); // tidak sesuai siklus
    expect((await send(owner, "post", "/kpi/reviews", { startDate: "2025-01-01" })).status).toBe(400); // terlalu lama
    expect((await send(atasan, "post", "/kpi/reviews", { startDate: "2026-09-01" })).status).toBe(403);
    const created = await send(owner, "post", "/kpi/reviews", { startDate: "2026-09-01" });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    expect(created.body.data.created).toBe(3);
    const periodId: string = created.body.data.periodId;

    // Karyawan baru masuk 15 Sep → tercatat belum punya penilaian, lalu ditambahkan dengan membuat ulang periode yang sama
    const eko = await addEmployee(ws, { fullName: "Eko Barista", departmentId: ws.departmentId, positionId: ws.positionId, joinDate: "2026-09-15" });
    expect((await get(owner, "/kpi/reviews")).body.data.missingCount).toBe(1);
    const added = await send(owner, "post", "/kpi/reviews", { startDate: "2026-09-01" });
    expect(added.body.data).toEqual({ periodId, created: 1 });

    // ——— Daftar: skor dihitung saat dibaca. Dewi: cup 176 ÷ 220 = 80% → 48 poin; hadir 100% ÷ 95% = 105,3% → 31,59 poin;
    // sikap kerja belum dinilai → (48 + 31,59) ÷ 90 × 100 = 88,4
    const list = (await get(owner, "/kpi/reviews")).body.data;
    expect(list.period).toMatchObject({ id: periodId, cycle: "monthly", startDate: "2026-09-01", endDate: "2026-09-30", counts: { draft: 4, reviewed: 0, final: 0 } });
    expect(list.rows.map((row: ListRow) => row.employee.fullName)).toEqual(["Budi Barista", "Dewi Barista", "Eko Barista", "Rina Admin"]);
    expect(list.candidates.map((candidate: { startDate: string }) => candidate.startDate)).not.toContain("2026-09-01");
    const dewiRow = reviewOf(list.rows, dewi);
    expect(dewiRow).toMatchObject({ status: "draft", score: "88.4", predicate: "good", unratedCount: 1 });
    const budiRow = reviewOf(list.rows, budi);
    const rinaRow = reviewOf(list.rows, rina);
    reviewOf(list.rows, eko);

    // Atasan: hanya bawahan langsung; karyawan tidak boleh
    const supervised = (await get(atasan, "/kpi/reviews")).body.data;
    expect(supervised).toMatchObject({ scope: "subordinates", candidates: [], missingCount: 0 });
    expect(supervised.rows.map((row: ListRow) => row.employee.id)).toEqual([dewi]);
    expect(supervised.period.counts).toEqual({ draft: 1, reviewed: 0, final: 0 });
    expect((await get(atasan, `/kpi/reviews/${budiRow.id}`)).status).toBe(404);
    expect((await get(karyawan, "/kpi/reviews")).status).toBe(403);
    expect((await get(karyawan, `/kpi/reviews/${dewiRow.id}`)).status).toBe(403);

    // ——— Nilai atasan (draft)
    let detail = (await get(atasan, `/kpi/reviews/${dewiRow.id}`)).body.data;
    expect(detail).toMatchObject({ status: "draft", template: { name: "Barista penilaian" }, pendingTaskLogs: 0, permissions: { rate: true, returnToDraft: false, finalize: false } });
    const saved = await send(atasan, "put", `/kpi/reviews/${dewiRow.id}/ratings`, { version: detail.version, ratings: [{ indicatorId: attitude, rating: 4 }], submit: false });
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
    // Versi basi → 409; indikator bukan penilaian → 400
    expect((await send(atasan, "put", `/kpi/reviews/${dewiRow.id}/ratings`, { version: detail.version, ratings: [], submit: false })).status).toBe(409);
    detail = (await get(atasan, `/kpi/reviews/${dewiRow.id}`)).body.data;
    expect((await send(atasan, "put", `/kpi/reviews/${dewiRow.id}/ratings`, { version: detail.version, ratings: [{ indicatorId: cups, rating: 3 }], submit: false })).status).toBe(400);
    // 48 + 31,59 + (4 ÷ 5 = 80% → 8) = 87,59 ÷ 100 × 100 = 87,6
    expect(detail.result).toMatchObject({ score: "87.6", predicate: "good", countedWeight: 100 });

    // Tidak menilai diri sendiri; kirim wajib semua indikator penilaian dinilai
    const rinaDetail = (await get(admin, `/kpi/reviews/${rinaRow.id}`)).body.data;
    expect(rinaDetail.permissions.rate).toBe(false);
    expect((await send(admin, "put", `/kpi/reviews/${rinaRow.id}/ratings`, { version: rinaDetail.version, ratings: [], submit: false })).status).toBe(403);
    const budiDetail = (await get(admin, `/kpi/reviews/${budiRow.id}`)).body.data;
    expect((await send(admin, "put", `/kpi/reviews/${budiRow.id}/ratings`, { version: budiDetail.version, ratings: [], submit: true })).status).toBe(400);

    // ——— draft → direview → (kembalikan) → direview → final
    const submitted = await send(atasan, "put", `/kpi/reviews/${dewiRow.id}/ratings`, { version: detail.version, ratings: [{ indicatorId: attitude, rating: 4 }], submit: true });
    expect(submitted.status, JSON.stringify(submitted.body)).toBe(200);
    detail = (await get(owner, `/kpi/reviews/${dewiRow.id}`)).body.data;
    expect(detail).toMatchObject({ status: "reviewed", submittedByName: "atasan Kopi Penilaian", permissions: { rate: false, returnToDraft: true, finalize: true } });
    expect((await send(atasan, "put", `/kpi/reviews/${dewiRow.id}/ratings`, { version: detail.version, ratings: [], submit: false })).status).toBe(409);
    expect((await send(atasan, "post", `/kpi/reviews/${dewiRow.id}/status`, { action: "finalize", version: detail.version })).status).toBe(403);

    expect((await send(owner, "post", `/kpi/reviews/${dewiRow.id}/status`, { action: "return", version: detail.version })).status).toBe(200);
    detail = (await get(atasan, `/kpi/reviews/${dewiRow.id}`)).body.data;
    expect(detail).toMatchObject({ status: "draft", submittedAt: null, result: { score: "87.6" } });
    await send(atasan, "put", `/kpi/reviews/${dewiRow.id}/ratings`, { version: detail.version, ratings: [{ indicatorId: attitude, rating: 4 }], submit: true });
    detail = (await get(owner, `/kpi/reviews/${dewiRow.id}`)).body.data;
    const finalized = await send(owner, "post", `/kpi/reviews/${dewiRow.id}/status`, { action: "finalize", version: detail.version });
    expect(finalized.status, JSON.stringify(finalized.body)).toBe(200);

    // ——— Final terkunci: catatan tugas yang disetujui sesudahnya tidak mengubah skor final
    await insertLog(ws, dewi, "2026-09-02", cups, "44", "approved");
    const locked = (await get(owner, `/kpi/reviews/${dewiRow.id}`)).body.data;
    expect(locked).toMatchObject({
      status: "final",
      finalizedByName: "owner Kopi Penilaian",
      employee: { fullName: "Dewi Barista", positionName: "Barista" },
      result: { score: "87.6", predicate: "good" },
      permissions: { rate: false, returnToDraft: false, finalize: false },
    });
    expect(reviewOf((await get(owner, "/kpi/reviews")).body.data.rows, dewi)).toMatchObject({ status: "final", score: "87.6" });
    // Skor ad-hoc periode yang sama ikut berubah (cup 220 → 100%), penilaian final tidak
    const adhoc = await get(owner, "/kpi/scores?from=2026-09-01&to=2026-09-30");
    const adhocDewi = adhoc.body.data.rows.find((row: { employee: { id: string } }) => row.employee.id === dewi);
    expect(adhocDewi.result.score).not.toBe("87.6");
    expect((await send(owner, "post", `/kpi/reviews/${dewiRow.id}/status`, { action: "return", version: locked.version })).status).toBe(409);
    expect((await send(atasan, "put", `/kpi/reviews/${dewiRow.id}/ratings`, { version: locked.version, ratings: [], submit: false })).status).toBe(409);
    // Di DB pun baris final tidak bisa diubah (trigger)
    await expect(
      withTenant(db, { tenantId: ws.tenantId, userId: null }, (tx) => tx.update(kpiReviews).set({ status: "draft" }).where(eq(kpiReviews.id, dewiRow.id))),
    ).rejects.toThrow();

    const audits = await withTenant(db, { tenantId: ws.tenantId, userId: null }, (tx) =>
      tx.select({ action: auditLogs.action }).from(auditLogs).where(and(eq(auditLogs.entity, "kpi_review"), eq(auditLogs.entityId, dewiRow.id))),
    );
    expect(audits.map((row) => row.action).sort()).toEqual(["finalize", "rate", "return", "submit", "submit"]);

    // ——— Periode tidak boleh beririsan: triwulan III memuat September
    await send(owner, "put", "/kpi/settings", { reviewCycle: "quarterly" });
    const quarterly = (await get(owner, "/kpi/reviews")).body.data;
    expect(quarterly.candidates.map((candidate: { startDate: string }) => candidate.startDate)).toEqual(["2026-04-01", "2026-01-01", "2025-10-01"]);
    expect((await send(owner, "post", "/kpi/reviews", { startDate: "2026-07-01" })).status).toBe(409);
    // Periode bulanan lama tetap bisa ditambah karyawan baru walau siklus kini triwulanan
    await addEmployee(ws, { fullName: "Fajar Barista", departmentId: ws.departmentId, positionId: ws.positionId, joinDate: "2026-09-28" });
    expect((await send(owner, "post", "/kpi/reviews", { startDate: "2026-09-01" })).body.data).toEqual({ periodId, created: 1 });
  });
});

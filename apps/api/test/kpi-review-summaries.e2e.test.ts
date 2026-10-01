import "reflect-metadata";
import { randomUUID } from "node:crypto";

import * as schema from "@exapay/db";
import { aiGenerations, attendanceRecords, auditLogs, departments, employees, kpiReviews, kpiReviewSummaries, memberships, positions, taskLogs, tenants, users } from "@exapay/db";
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
import { AI_QUEUE, type AiQueue } from "../src/redis/redis.module.js";
import { type Database, withTenant, withUser } from "../src/database/tenant-transaction.js";
import { seedTenantDefaults } from "../src/modules/tenants/tenant-defaults.js";

// Verifikasi feature 23 (API): ringkasan AI penilaian KPI — generate masuk antrean (input terstruktur tanpa nama karyawan),
// hasil worker dipasang ke narasi, atasan/owner bisa edit & menandai ditinjau, tidak bisa final tanpa ditinjau, narasi ikut
// snapshot final & terkunci, kuota per usaha per bulan dengan pesan jelas, generasi macet bisa dibuat ulang.

const PASSWORD = "password-review-123";
const ROLES = ["owner", "admin", "atasan", "karyawan"] as const;

let app: INestApplication;
let server: Parameters<typeof request>[0];
let pool: pg.Pool;
let db: Database;
let ownerPool: pg.Pool;
let queue: AiQueue;

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
  ownerPool = new pg.Pool({ connectionString: inject("testOwnerDatabaseUrl") });
  db = drizzle({ client: pool, schema });
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();
  server = app.getHttpServer();
  queue = app.get<AiQueue>(AI_QUEUE);
});

afterEach(() => {
  vi.useRealTimers();
});

afterAll(async () => {
  await queue?.obliterate({ force: true });
  await app?.close();
  await pool?.end();
  await ownerPool?.end();
});

type Summary = {
  body: string | null;
  source: string | null;
  version: string;
  reviewedAt: string | null;
  reviewedByName: string | null;
  generation: { status: string; pending: boolean; error: string | null } | null;
  quota: { used: number; limit: number; resetsOn: string } | null;
};

async function summaryOf(token: string, reviewId: string): Promise<{ summary: Summary; permissions: { summary: boolean }; status: string }> {
  const res = await get(token, `/kpi/reviews/${reviewId}`);
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body.data;
}

async function latestGeneration(ws: Workspace, reviewId: string) {
  return withTenant(db, { tenantId: ws.tenantId, userId: null }, async (tx) => {
    const [summary] = await tx.select({ generationId: kpiReviewSummaries.generationId }).from(kpiReviewSummaries).where(eq(kpiReviewSummaries.reviewId, reviewId));
    if (!summary?.generationId) throw new Error("belum ada generasi");
    const [generation] = await tx.select().from(aiGenerations).where(eq(aiGenerations.id, summary.generationId));
    if (!generation) throw new Error("generasi tidak ditemukan");
    return generation;
  });
}

// Tiru hasil worker (processor di apps/worker diuji manual): generasi selesai + narasi dipasang, belum ditinjau
async function completeGeneration(ws: Workspace, reviewId: string, output: string): Promise<void> {
  const generation = await latestGeneration(ws, reviewId);
  await withTenant(db, { tenantId: ws.tenantId, userId: null }, async (tx) => {
    await tx
      .update(aiGenerations)
      .set({ status: "succeeded", output, provider: "fake", model: "fake-dev", promptVersion: "kpi-review-summary/v1", completedAt: new Date() })
      .where(eq(aiGenerations.id, generation.id));
    await tx.update(kpiReviewSummaries).set({ body: output, source: "ai", reviewedAt: null }).where(eq(kpiReviewSummaries.reviewId, reviewId));
  });
}

describe("ringkasan AI penilaian KPI", () => {
  it("generate lewat antrean, tinjau/edit, syarat final, snapshot terkunci", async () => {
    setNow();
    const ws = await createWorkspace("Kopi Ringkasan");
    const supervisor = await addEmployee(ws, { userId: ws.userIds.atasan, fullName: "Andi Atasan", departmentId: ws.departmentId, positionId: ws.otherPositionId });
    const dewi = await addEmployee(ws, { userId: ws.userIds.karyawan, supervisorId: supervisor, fullName: "Dewi Kartikasari", departmentId: ws.departmentId, positionId: ws.positionId });
    const budi = await addEmployee(ws, { fullName: "Budi Barista", departmentId: ws.departmentId, positionId: ws.positionId });

    const owner = await tokenOf(ws, "owner");
    const atasan = await tokenOf(ws, "atasan");
    const karyawan = await tokenOf(ws, "karyawan");
    const { cups, attitude } = await createTemplate(ws, owner);
    for (const date of septemberWorkdays()) await checkIn(ws, dewi, date);
    await insertLog(ws, dewi, "2026-09-01", cups, "176", "approved");
    await send(owner, "post", "/kpi/reviews", { startDate: "2026-09-01" });
    const rows: ListRow[] = (await get(owner, "/kpi/reviews")).body.data.rows;
    const dewiReview = reviewOf(rows, dewi).id;
    const budiReview = reviewOf(rows, budi).id;

    // ——— Awal: belum ada narasi; kuota 200/bulan, terisi lagi 1 Nov (zona waktu usaha)
    const initial = await summaryOf(atasan, dewiReview);
    expect(initial.summary).toEqual({ body: null, source: null, version: "0", reviewedAt: null, reviewedByName: null, generation: null, quota: { used: 0, limit: 200, resetsOn: "2026-11-01" } });
    expect(initial.permissions.summary).toBe(true);
    expect((await send(karyawan, "post", `/kpi/reviews/${dewiReview}/summary/generate`, { version: "0" })).status).toBe(403);

    // ——— Generate (atasan langsung): 202, generasi queued + job antrean; input tanpa nama karyawan
    const generated = await send(atasan, "post", `/kpi/reviews/${dewiReview}/summary/generate`, { version: "0" });
    expect(generated.status, JSON.stringify(generated.body)).toBe(202);
    const generation = await latestGeneration(ws, dewiReview);
    expect(generation).toMatchObject({ status: "queued", requestedByName: "atasan Kopi Ringkasan", output: null });
    const input = JSON.stringify(generation.input);
    expect(input).not.toContain("Dewi");
    expect(input).not.toContain("Kartikasari");
    expect(generation.input).toMatchObject({ employee: { positionName: "Barista", departmentName: "Operasional" }, templateName: "Barista penilaian", period: { cycle: "monthly", startDate: "2026-09-01", endDate: "2026-09-30" } });
    const job = await queue.getJob(generation.id);
    expect(job?.data).toEqual({ tenantId: ws.tenantId, generationId: generation.id });

    const pending = await summaryOf(atasan, dewiReview);
    expect(pending.summary.generation).toMatchObject({ status: "queued", pending: true, error: null });
    expect(pending.summary.quota?.used).toBe(1);
    // Selama AI menulis: tidak bisa generate/edit lagi
    expect((await send(atasan, "post", `/kpi/reviews/${dewiReview}/summary/generate`, { version: pending.summary.version })).status).toBe(409);
    expect((await send(atasan, "put", `/kpi/reviews/${dewiReview}/summary`, { version: pending.summary.version, body: "Tulisan saya" })).status).toBe(409);

    // Atasan kirim penilaian; final ditolak selama AI masih menulis
    const detail = (await get(atasan, `/kpi/reviews/${dewiReview}`)).body.data;
    expect((await send(atasan, "put", `/kpi/reviews/${dewiReview}/ratings`, { version: detail.version, ratings: [{ indicatorId: attitude, rating: 4 }], submit: true })).status).toBe(200);
    let version: string = (await get(owner, `/kpi/reviews/${dewiReview}`)).body.data.version;
    const whilePending = await send(owner, "post", `/kpi/reviews/${dewiReview}/status`, { action: "finalize", version });
    expect(whilePending.status).toBe(409);
    expect(whilePending.body.error).toContain("sedang dibuat");

    // ——— Worker selesai → narasi AI belum ditinjau; final ditolak
    await completeGeneration(ws, dewiReview, "Karyawan mencapai skor baik.\n\nPertahankan kehadiran.");
    const ready = await summaryOf(owner, dewiReview);
    expect(ready.summary).toMatchObject({ body: "Karyawan mencapai skor baik.\n\nPertahankan kehadiran.", source: "ai", reviewedAt: null, generation: { status: "succeeded", pending: false } });
    const unreviewed = await send(owner, "post", `/kpi/reviews/${dewiReview}/status`, { action: "finalize", version });
    expect(unreviewed.status).toBe(400);
    expect(unreviewed.body.error).toContain("Tinjau ringkasan");

    // Penilaian sudah dikirim → atasan tidak lagi mengubah narasi; owner/admin boleh
    expect((await summaryOf(atasan, dewiReview)).permissions.summary).toBe(false);
    expect((await send(atasan, "post", `/kpi/reviews/${dewiReview}/summary/review`, { version: ready.summary.version })).status).toBe(403);
    // Versi basi → 409
    expect((await send(owner, "post", `/kpi/reviews/${dewiReview}/summary/review`, { version: "1" })).status).toBe(409);
    const reviewed = await send(owner, "post", `/kpi/reviews/${dewiReview}/summary/review`, { version: ready.summary.version });
    expect(reviewed.status, JSON.stringify(reviewed.body)).toBe(200);
    const afterReview = await summaryOf(owner, dewiReview);
    expect(afterReview.summary).toMatchObject({ source: "ai", reviewedByName: "owner Kopi Ringkasan" });
    expect(afterReview.summary.reviewedAt).not.toBeNull();

    // Edit hasil AI → sumber "edited", tetap ditinjau
    const edited = await send(owner, "put", `/kpi/reviews/${dewiReview}/summary`, { version: afterReview.summary.version, body: "  Karyawan mencapai skor baik dan disiplin.  " });
    expect(edited.status, JSON.stringify(edited.body)).toBe(200);
    expect((await summaryOf(owner, dewiReview)).summary).toMatchObject({ body: "Karyawan mencapai skor baik dan disiplin.", source: "edited" });

    // ——— Final: narasi ikut snapshot, lalu terkunci
    version = (await get(owner, `/kpi/reviews/${dewiReview}`)).body.data.version;
    const finalized = await send(owner, "post", `/kpi/reviews/${dewiReview}/status`, { action: "finalize", version });
    expect(finalized.status, JSON.stringify(finalized.body)).toBe(200);
    const final = await summaryOf(owner, dewiReview);
    expect(final.summary).toMatchObject({ body: "Karyawan mencapai skor baik dan disiplin.", source: "edited", reviewedByName: "owner Kopi Ringkasan", generation: null, quota: null });
    expect(final.permissions.summary).toBe(false);
    const [snapshotRow] = await withTenant(db, { tenantId: ws.tenantId, userId: null }, (tx) => tx.select({ snapshot: kpiReviews.snapshot }).from(kpiReviews).where(eq(kpiReviews.id, dewiReview)));
    expect(snapshotRow?.snapshot).toMatchObject({ summary: { body: "Karyawan mencapai skor baik dan disiplin.", source: "edited", model: "fake-dev", promptVersion: "kpi-review-summary/v1" } });
    expect((await send(owner, "post", `/kpi/reviews/${dewiReview}/summary/generate`, { version: "0" })).status).toBe(409);
    expect((await send(owner, "put", `/kpi/reviews/${dewiReview}/summary`, { version: "0", body: "Ubah" })).status).toBe(409);
    await expect(
      withTenant(db, { tenantId: ws.tenantId, userId: null }, (tx) => tx.update(kpiReviewSummaries).set({ body: "diubah" }).where(eq(kpiReviewSummaries.reviewId, dewiReview))),
    ).rejects.toThrow();

    // ——— Tulis sendiri tanpa AI (Budi, tanpa atasan → owner) → manual + ditinjau; final tanpa narasi tetap boleh (lihat test lain)
    const manual = await send(owner, "put", `/kpi/reviews/${budiReview}/summary`, { version: "0", body: "Belum ada catatan tugas di periode ini." });
    expect(manual.status, JSON.stringify(manual.body)).toBe(200);
    expect((await summaryOf(owner, budiReview)).summary).toMatchObject({ source: "manual", generation: null });
    expect((await send(owner, "put", `/kpi/reviews/${budiReview}/summary`, { version: "0", body: "" })).status).toBe(400);

    const actions = await withTenant(db, { tenantId: ws.tenantId, userId: null }, (tx) =>
      tx.select({ action: auditLogs.action }).from(auditLogs).where(and(eq(auditLogs.entity, "kpi_review_summary"), eq(auditLogs.entityId, dewiReview))),
    );
    expect(actions.map((row) => row.action).sort()).toEqual(["edit", "generate", "review"]);
  });

  it("kuota per usaha per bulan, generasi gagal tidak dihitung, generasi macet bisa dibuat ulang", async () => {
    setNow();
    const ws = await createWorkspace("Kopi Kuota");
    const dewi = await addEmployee(ws, { fullName: "Dewi Barista", departmentId: ws.departmentId, positionId: ws.positionId });
    const owner = await tokenOf(ws, "owner");
    await createTemplate(ws, owner);
    await send(owner, "post", "/kpi/reviews", { startDate: "2026-09-01" });
    const reviewId = reviewOf((await get(owner, "/kpi/reviews")).body.data.rows, dewi).id;

    // Kuota hanya bisa diubah super-admin/app_owner (trigger)
    await expect(withTenant(db, { tenantId: ws.tenantId, userId: ws.userIds.owner }, (tx) => tx.update(tenants).set({ aiSummaryMonthlyQuota: 999 }).where(eq(tenants.id, ws.tenantId)))).rejects.toThrow();
    // app_owner juga tunduk FORCE RLS → set konteks tenant di transaksi yang sama
    const client = await ownerPool.connect();
    try {
      await client.query("begin");
      await client.query("select set_config('app.tenant_id', $1, true)", [ws.tenantId]);
      const updated = await client.query("update tenants set ai_summary_monthly_quota = 1 where id = $1", [ws.tenantId]);
      expect(updated.rowCount).toBe(1);
      await client.query("commit");
    } finally {
      client.release();
    }

    // Generasi gagal bulan ini & generasi bulan lalu tidak dihitung
    await withTenant(db, { tenantId: ws.tenantId, userId: null }, (tx) =>
      tx.insert(aiGenerations).values([
        { tenantId: ws.tenantId, reviewId, input: {}, status: "failed", error: "Gagal", createdAt: new Date("2026-10-05T03:00:00Z") },
        { tenantId: ws.tenantId, reviewId, input: {}, status: "succeeded", output: "Lama", createdAt: new Date("2026-09-30T16:30:00Z") }, // 30 Sep 23.30 WIB
      ]),
    );
    expect((await summaryOf(owner, reviewId)).summary.quota).toEqual({ used: 0, limit: 1, resetsOn: "2026-11-01" });

    expect((await send(owner, "post", `/kpi/reviews/${reviewId}/summary/generate`, { version: "0" })).status).toBe(202);
    const generation = await latestGeneration(ws, reviewId);

    // Macet > 10 menit (worker mati) → tidak lagi dianggap berjalan; generate ulang boleh dan generasi macet ditandai gagal
    // (tidak memakan kuota)
    await withTenant(db, { tenantId: ws.tenantId, userId: null }, (tx) =>
      tx.update(aiGenerations).set({ createdAt: new Date("2026-10-09T02:45:00Z") }).where(eq(aiGenerations.id, generation.id)),
    );
    const stale = await summaryOf(owner, reviewId);
    expect(stale.summary.generation).toMatchObject({ status: "queued", pending: false });
    const retried = await send(owner, "post", `/kpi/reviews/${reviewId}/summary/generate`, { version: stale.summary.version });
    expect(retried.status, JSON.stringify(retried.body)).toBe(202);
    const [stuck] = await withTenant(db, { tenantId: ws.tenantId, userId: null }, (tx) => tx.select().from(aiGenerations).where(eq(aiGenerations.id, generation.id)));
    expect(stuck).toMatchObject({ status: "failed", error: "Pembuatan ringkasan tidak selesai (waktu proses habis). Silakan buat ulang." });
    expect((await summaryOf(owner, reviewId)).summary.quota?.used).toBe(1);

    // Kuota habis → 429 dengan pesan jelas; menulis sendiri tetap bisa
    await completeGeneration(ws, reviewId, "Narasi AI.");
    const ready = await summaryOf(owner, reviewId);
    const exhausted = await send(owner, "post", `/kpi/reviews/${reviewId}/summary/generate`, { version: ready.summary.version });
    expect(exhausted.status).toBe(429);
    expect(exhausted.body.error).toBe("Kuota ringkasan AI bulan ini sudah habis (1/1). Kuota terisi lagi 1 November 2026. Anda tetap bisa menulis ringkasan sendiri.");
    const manual = await send(owner, "put", `/kpi/reviews/${reviewId}/summary`, { version: ready.summary.version, body: "Ditulis manual." });
    expect(manual.status, JSON.stringify(manual.body)).toBe(200);
    // Isi AI diubah → edited
    expect((await summaryOf(owner, reviewId)).summary).toMatchObject({ source: "edited", quota: { used: 1, limit: 1 } });
  });
});

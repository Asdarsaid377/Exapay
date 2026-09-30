import "reflect-metadata";
import { randomUUID } from "node:crypto";

import * as schema from "@exapay/db";
import { attendanceRecords, auditLogs, departments, employees, memberships, positions, tenants, users } from "@exapay/db";
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
import { verifiedTaskTotals } from "../src/modules/tasks/verified-task-totals.js";
import { seedTenantDefaults } from "../src/modules/tenants/tenant-defaults.js";

// Verifikasi feature 20 (API): atasan langsung / owner / admin menyetujui, menolak (beralasan), atau mengoreksi angka
// (beralasan) catatan tugas; keputusan final & diaudit; setujui sekaligus melewati catatan yang sudah berubah.
// Hanya catatan disetujui (angka koreksi bila ada) yang masuk total skor.

const PASSWORD = "password-verify-123";
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

async function addEmployee(ws: Workspace, userId: string | null, supervisorId: string | null = null): Promise<string> {
  const id = randomUUID();
  await withTenant(db, { tenantId: ws.tenantId, userId: null }, (tx) =>
    tx.insert(employees).values({
      id,
      tenantId: ws.tenantId,
      fullName: `Karyawan ${id.slice(0, 6)}`,
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

// Karyawan tanpa akun (tidak bisa login) — catatannya disisipkan langsung
async function insertLog(ws: Workspace, employeeId: string, workDate: string, indicatorId: string, quantity: string): Promise<string> {
  const id = randomUUID();
  await withTenant(db, { tenantId: ws.tenantId, userId: null }, (tx) => tx.insert(schema.taskLogs).values({ id, tenantId: ws.tenantId, employeeId, workDate, indicatorId, quantity }));
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

function logTask(token: string, fields: Record<string, string>): request.Test {
  let built = request(server).post("/tasks/me/logs").set("Authorization", `Bearer ${token}`);
  for (const [name, value] of Object.entries(fields)) built = built.field(name, value);
  return built;
}

function editTask(token: string, id: string, fields: Record<string, string>): request.Test {
  let built = request(server).put(`/tasks/me/logs/${id}`).set("Authorization", `Bearer ${token}`);
  for (const [name, value] of Object.entries(fields)) built = built.field(name, value);
  return built;
}

type TemplateIds = { cups: string; sales: string };

async function createTemplate(ws: Workspace, owner: string): Promise<TemplateIds> {
  const created = await post(owner, "/kpi/templates", {
    name: "Barista",
    description: null,
    positionIds: [ws.positionId],
    indicators: [
      { name: "Cup terjual", type: "count", unit: "cup", target: "120", targetPeriod: "daily", weight: 60 },
      { name: "Nilai penjualan", type: "numeric", unit: "Rupiah", target: "5000000", targetPeriod: "weekly", weight: 40 },
    ],
  });
  expect(created.status, JSON.stringify(created.body)).toBe(201);
  const overview = await get(owner, "/kpi/templates");
  const template = overview.body.data.templates.find((candidate: { id: string }) => candidate.id === created.body.data.id);
  const idOf = (name: string): string => template.indicators.find((indicator: { name: string }) => indicator.name === name).id;
  return { cups: idOf("Cup terjual"), sales: idOf("Nilai penjualan") };
}

type Item = { id: string; version: string; status: string; canDecide: boolean; employee: { id: string } };

async function listOf(token: string, status = "pending"): Promise<{ items: Item[]; pendingCount: number; scope: string }> {
  const res = await get(token, `/tasks/verification?status=${status}`);
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body.data;
}

function itemOf(list: { items: Item[] }, id: string): Item {
  const item = list.items.find((candidate) => candidate.id === id);
  if (!item) throw new Error(`catatan ${id} tidak ada di daftar`);
  return item;
}

// Senin 5 Okt 2026, 09:00 WIB
function setNow(): void {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-05T02:00:00Z"));
}
const TODAY = "2026-10-05";

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

describe("verifikasi tugas", () => {
  it("atasan langsung menyetujui, menolak, mengoreksi; hanya yang disetujui masuk total skor", async () => {
    setNow();
    const ws = await createWorkspace("Kopi Verifikasi");
    const supervisorEmployee = await addEmployee(ws, ws.userIds.atasan);
    const employeeId = await addEmployee(ws, ws.userIds.karyawan, supervisorEmployee);
    // Karyawan tanpa atasan: tidak terlihat atasan, diverifikasi owner/admin
    const loneEmployee = await addEmployee(ws, null);
    const owner = await tokenOf(ws, "owner");
    const admin = await tokenOf(ws, "admin");
    const atasan = await tokenOf(ws, "atasan");
    const karyawan = await tokenOf(ws, "karyawan");
    const ids = await createTemplate(ws, owner);

    await checkIn(ws, employeeId, TODAY);
    await checkIn(ws, loneEmployee, TODAY);
    const create = async (fields: Record<string, string>): Promise<string> => {
      const res = await logTask(karyawan, { workDate: TODAY, ...fields });
      expect(res.status, JSON.stringify(res.body)).toBe(201);
      return res.body.data.id;
    };
    const approveId = await create({ indicatorId: ids.cups, quantity: "40" });
    const correctId = await create({ indicatorId: ids.cups, quantity: "46" });
    const rejectId = await create({ indicatorId: ids.sales, quantity: "900000" });
    const otherId = await create({ indicatorId: "", quantity: "", note: "Membersihkan mesin espresso" });
    const pendingId = await create({ indicatorId: ids.sales, quantity: "250000" });
    const loneId = await insertLog(ws, loneEmployee, TODAY, ids.cups, "10");

    // Karyawan biasa tidak punya akses halaman verifikasi
    expect((await get(karyawan, "/tasks/verification")).status).toBe(403);

    const mine = await listOf(atasan);
    expect(mine.scope).toBe("subordinates");
    expect(mine.pendingCount).toBe(5);
    expect(mine.items.map((item) => item.id)).not.toContain(loneId);
    const listed = await get(atasan, "/tasks/verification");
    expect(listed.body.data.items[0]).toMatchObject({
      id: approveId,
      workDate: TODAY,
      quantity: "40",
      status: "pending",
      canDecide: true,
      indicator: { id: ids.cups, name: "Cup terjual", type: "count", unit: "cup", target: "120", targetPeriod: "daily" },
      employee: { id: employeeId, positionName: "Barista" },
      verifiedQuantity: null,
      decidedByName: null,
    });
    expect((await listOf(owner)).scope).toBe("all");
    expect((await listOf(owner)).pendingCount).toBe(6);

    // Atasan tidak bisa memutuskan catatan di luar bawahannya
    const loneVersion = itemOf(await listOf(owner), loneId).version;
    expect((await post(atasan, `/tasks/verification/${loneId}/decision`, { decision: "approve", version: loneVersion })).status).toBe(404);
    expect((await post(admin, `/tasks/verification/${loneId}/decision`, { decision: "approve", version: loneVersion })).status).toBe(200);

    const version = async (id: string): Promise<string> => itemOf(await listOf(atasan, "all"), id).version;
    const decide = (id: string, body: object): request.Test => post(atasan, `/tasks/verification/${id}/decision`, body);

    // Setujui
    const approved = await decide(approveId, { decision: "approve", version: await version(approveId) });
    expect(approved.status, JSON.stringify(approved.body)).toBe(200);

    // Koreksi: wajib alasan, count bulat, angka harus berbeda
    const correctVersion = await version(correctId);
    expect((await decide(correctId, { decision: "correct", version: correctVersion, quantity: "40" })).status).toBe(400);
    expect((await decide(correctId, { decision: "correct", version: correctVersion, quantity: "40.5", note: "Cek struk" })).status).toBe(400);
    expect((await decide(correctId, { decision: "correct", version: correctVersion, quantity: "46", note: "Cek struk" })).status).toBe(400);
    const corrected = await decide(correctId, { decision: "correct", version: correctVersion, quantity: "41", note: "Struk kasir hanya 41 cup" });
    expect(corrected.status, JSON.stringify(corrected.body)).toBe(200);

    // Tolak wajib alasan
    const rejectVersion = await version(rejectId);
    expect((await decide(rejectId, { decision: "reject", version: rejectVersion })).status).toBe(400);
    expect((await decide(rejectId, { decision: "reject", version: rejectVersion, note: "Tidak ada bukti penjualan" })).status).toBe(200);

    // Pekerjaan lain tidak bisa dikoreksi, tapi bisa disetujui
    const otherVersion = await version(otherId);
    expect((await decide(otherId, { decision: "correct", version: otherVersion, quantity: "1", note: "Salah" })).status).toBe(400);
    expect((await decide(otherId, { decision: "approve", version: otherVersion })).status).toBe(200);

    // Keputusan final
    expect((await decide(approveId, { decision: "reject", version: await version(approveId), note: "Berubah pikiran" })).status).toBe(409);
    expect((await listOf(atasan)).pendingCount).toBe(1);
    // Karyawan tidak bisa lagi mengubah catatan yang sudah diputuskan
    expect((await editTask(karyawan, correctId, { indicatorId: ids.cups, quantity: "50", note: "", removePhoto: "false" })).status).toBe(409);

    const decided = await listOf(atasan, "approved");
    expect(itemOf(decided, correctId)).toMatchObject({ status: "approved", quantity: "46", verifiedQuantity: "41", decisionNote: "Struk kasir hanya 41 cup", decidedByName: "atasan Kopi Verifikasi", canDecide: false });

    // Portal karyawan: keputusan terbaca, total memakai angka koreksi & tanpa yang ditolak, verifikasi bukan "diubah"
    const day = await get(karyawan, "/tasks/me");
    const logs: { id: string; editedAt: string | null; verifiedQuantity: string | null; decisionNote: string | null; editable: boolean }[] = day.body.data.logs;
    expect(logs.find((log) => log.id === correctId)).toMatchObject({ verifiedQuantity: "41", editedAt: null, editable: false });
    expect(logs.find((log) => log.id === rejectId)).toMatchObject({ decisionNote: "Tidak ada bukti penjualan", verifiedQuantity: null });
    expect(day.body.data.indicators).toMatchObject([
      { id: ids.cups, total: "81", approvedCount: 2 },
      { id: ids.sales, total: "250000", rejectedCount: 1, pendingCount: 1 },
    ]);

    // Total skor: hanya yang disetujui (angka koreksi), menunggu & ditolak tidak dihitung
    const totals = await withTenant(db, { tenantId: ws.tenantId, userId: null }, (tx) => verifiedTaskTotals(tx, [employeeId, loneEmployee], TODAY, TODAY));
    expect(totals).toHaveLength(2);
    expect(totals).toEqual(
      expect.arrayContaining([
        { employeeId, indicatorId: ids.cups, total: "81" },
        { employeeId: loneEmployee, indicatorId: ids.cups, total: "10" },
      ]),
    );
    expect(pendingId).toBeTruthy();

    // Setiap keputusan diaudit
    const audits = await withTenant(db, { tenantId: ws.tenantId, userId: null }, (tx) =>
      tx.select({ entityId: auditLogs.entityId, action: auditLogs.action, after: auditLogs.after }).from(auditLogs).where(eq(auditLogs.entity, "task_log")),
    );
    expect(audits).toHaveLength(5);
    expect(audits.find((audit) => audit.entityId === correctId)).toMatchObject({ action: "correct", after: { status: "approved", verifiedQuantity: "41" } });
  });

  it("catatan yang diubah karyawan setelah dibaca ditolak; setujui sekaligus melewati yang sudah berubah", async () => {
    setNow();
    const ws = await createWorkspace("Kopi Massal");
    const supervisorEmployee = await addEmployee(ws, ws.userIds.atasan);
    const employeeId = await addEmployee(ws, ws.userIds.karyawan, supervisorEmployee);
    // Owner juga karyawan (bawahan atasan) — tidak bisa memverifikasi catatannya sendiri
    const ownerEmployee = await addEmployee(ws, ws.userIds.owner, supervisorEmployee);
    const owner = await tokenOf(ws, "owner");
    const atasan = await tokenOf(ws, "atasan");
    const karyawan = await tokenOf(ws, "karyawan");
    const ids = await createTemplate(ws, owner);
    await checkIn(ws, employeeId, TODAY);
    await checkIn(ws, ownerEmployee, TODAY);

    const logIds: string[] = [];
    for (const quantity of ["10", "20", "30", "40"]) {
      const res = await logTask(karyawan, { workDate: TODAY, indicatorId: ids.cups, quantity });
      expect(res.status).toBe(201);
      logIds.push(res.body.data.id);
    }
    const [editedId = "", decidedId = "", deletedId = "", freshId = ""] = logIds;
    const ownLog = await insertLog(ws, ownerEmployee, TODAY, ids.cups, "5");
    const before = await listOf(atasan);
    const versionOf = (id: string): string => itemOf(before, id).version;

    // Karyawan mengubah setelah atasan membaca → keputusan dengan versi lama ditolak
    const edit = await editTask(karyawan, editedId, { indicatorId: ids.cups, quantity: "12", note: "", removePhoto: "false" });
    expect(edit.status, JSON.stringify(edit.body)).toBe(200);
    expect(edit.body.data.editedAt).not.toBeNull();
    expect((await post(atasan, `/tasks/verification/${editedId}/decision`, { decision: "approve", version: versionOf(editedId) })).status).toBe(409);

    expect((await post(atasan, `/tasks/verification/${decidedId}/decision`, { decision: "approve", version: versionOf(decidedId) })).status).toBe(200);
    expect((await request(server).delete(`/tasks/me/logs/${deletedId}`).set("Authorization", `Bearer ${karyawan}`)).status).toBe(200);

    // Owner tidak memverifikasi catatannya sendiri
    const ownerList = await listOf(owner);
    expect(itemOf(ownerList, ownLog).canDecide).toBe(false);
    expect((await post(owner, `/tasks/verification/${ownLog}/decision`, { decision: "approve", version: itemOf(ownerList, ownLog).version })).status).toBe(403);
    expect((await post(owner, "/tasks/verification/approve", { items: [{ id: ownLog, version: itemOf(ownerList, ownLog).version }] })).status).toBe(403);

    const bulk = await post(atasan, "/tasks/verification/approve", {
      items: [editedId, decidedId, deletedId, freshId, ownLog].map((id) => ({ id, version: versionOf(id) })),
    });
    expect(bulk.status, JSON.stringify(bulk.body)).toBe(200);
    // Hanya freshId & ownLog (catatan owner, diputuskan atasannya) yang masih sama
    expect(bulk.body.data).toEqual({ approved: 2, skipped: 3 });
    const after = await listOf(atasan, "all");
    expect(itemOf(after, freshId)).toMatchObject({ status: "approved", verifiedQuantity: "40" });
    expect(itemOf(after, editedId)).toMatchObject({ status: "pending", quantity: "12" });

    // Tenant lain: catatan tidak terlihat
    const other = await createWorkspace("Kopi Lain");
    const otherOwner = await tokenOf(other, "owner");
    expect((await post(otherOwner, `/tasks/verification/${editedId}/decision`, { decision: "approve", version: "1" })).status).toBe(404);
    expect((await post(otherOwner, "/tasks/verification/approve", { items: [{ id: editedId, version: "1" }] })).body.data).toEqual({ approved: 0, skipped: 1 });
    const stillPending = await withTenant(db, { tenantId: ws.tenantId, userId: null }, (tx) =>
      tx.select({ status: schema.taskLogs.status }).from(schema.taskLogs).where(and(eq(schema.taskLogs.id, editedId))),
    );
    expect(stillPending[0]?.status).toBe("pending");
  });
});

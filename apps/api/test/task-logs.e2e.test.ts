import "reflect-metadata";
import { randomUUID } from "node:crypto";

import * as schema from "@exapay/db";
import { attendanceRecords, departments, employees, memberships, positions, taskLogs, tenants, users } from "@exapay/db";
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

// Verifikasi feature 19 (API): karyawan mencatat realisasi indikator template jabatan / pekerjaan lain (+ foto di storage S3)
// setelah absen masuk, dalam jendela hari ini − 7 hari; foto terbaca pemilik, atasan langsung, owner. Indikator yang sudah
// punya log tidak bisa dihapus/diganti tipenya. Butuh container storage (SeaweedFS) selain postgres/redis/mailpit.

const PASSWORD = "password-tasks-123";
const ROLES = ["owner", "admin", "atasan", "karyawan"] as const;
// PNG 1×1 minimal (cukup untuk pemeriksaan magic bytes)
const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082", "hex");
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00]);

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

async function tokenOf(ws: Workspace, role: MembershipRole): Promise<string> {
  const res = await request(server).post("/auth/login").send({ email: ws.emails[role], password: PASSWORD, client: "mobile" });
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body.data.tokens.accessToken;
}

function get(token: string, path: string): request.Test {
  return request(server).get(path).set("Authorization", `Bearer ${token}`);
}

type Photo = { buffer: Buffer; filename: string; contentType: string };

function withFields(req: request.Test, fields: Record<string, string>, photo?: Photo): request.Test {
  let built = req;
  for (const [name, value] of Object.entries(fields)) built = built.field(name, value);
  if (photo) built = built.attach("photo", photo.buffer, { filename: photo.filename, contentType: photo.contentType });
  return built;
}

function logTask(token: string, fields: Record<string, string>, photo?: Photo): request.Test {
  return withFields(request(server).post("/tasks/me/logs").set("Authorization", `Bearer ${token}`), fields, photo);
}

function editTask(token: string, id: string, fields: Record<string, string>, photo?: Photo): request.Test {
  return withFields(request(server).put(`/tasks/me/logs/${id}`).set("Authorization", `Bearer ${token}`), fields, photo);
}

function deleteTask(token: string, id: string): request.Test {
  return request(server).delete(`/tasks/me/logs/${id}`).set("Authorization", `Bearer ${token}`);
}

type TemplateIds = { templateId: string; cups: string; sales: string; rating: string };

const TEMPLATE_BODY = (positionId: string) => ({
  name: "Barista",
  description: null,
  positionIds: [positionId],
  indicators: [
    { name: "Cup terjual", type: "count", unit: "cup", target: "120", targetPeriod: "daily", weight: 40 },
    { name: "Nilai penjualan", type: "numeric", unit: "Rupiah", target: "5000000", targetPeriod: "weekly", weight: 40 },
    { name: "Kebersihan area bar", type: "rating", weight: 20 },
  ],
});

async function createTemplate(ws: Workspace, owner: string): Promise<TemplateIds> {
  const created = await request(server).post("/kpi/templates").set("Authorization", `Bearer ${owner}`).send(TEMPLATE_BODY(ws.positionId));
  expect(created.status, JSON.stringify(created.body)).toBe(201);
  const overview = await get(owner, "/kpi/templates");
  const template = overview.body.data.templates.find((candidate: { id: string }) => candidate.id === created.body.data.id);
  const idOf = (name: string): string => template.indicators.find((indicator: { name: string }) => indicator.name === name).id;
  return { templateId: template.id, cups: idOf("Cup terjual"), sales: idOf("Nilai penjualan"), rating: idOf("Kebersihan area bar") };
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

describe("log tugas harian", () => {
  it("wajib absen masuk; realisasi indikator & pekerjaan lain tercatat, foto terbaca pemilik/atasan/owner", async () => {
    setNow();
    const ws = await createWorkspace("Kopi Tugas");
    const supervisorEmployee = await addEmployee(ws, ws.userIds.atasan);
    const employeeId = await addEmployee(ws, ws.userIds.karyawan, supervisorEmployee);
    const owner = await tokenOf(ws, "owner");
    const karyawan = await tokenOf(ws, "karyawan");
    const atasan = await tokenOf(ws, "atasan");
    const ids = await createTemplate(ws, owner);

    // Belum absen masuk → belum bisa mencatat
    const before = await get(karyawan, "/tasks/me");
    expect(before.status, JSON.stringify(before.body)).toBe(200);
    expect(before.body.data).toMatchObject({ access: "ok", today: TODAY, date: TODAY, minDate: "2026-09-28", checkedIn: false, canLog: false, template: { name: "Barista" } });
    expect(before.body.data.days).toHaveLength(8);
    // Hanya indikator angka/jumlah yang dicatat karyawan
    expect(before.body.data.indicators.map((indicator: { name: string }) => indicator.name)).toEqual(["Cup terjual", "Nilai penjualan"]);
    const blocked = await logTask(karyawan, { workDate: TODAY, indicatorId: ids.cups, quantity: "10" });
    expect(blocked.status).toBe(409);

    await checkIn(ws, employeeId, TODAY);
    const first = await logTask(karyawan, { workDate: TODAY, indicatorId: ids.cups, quantity: "40", note: "Shift pagi" }, { buffer: PNG, filename: "struk.png", contentType: "image/png" });
    expect(first.status, JSON.stringify(first.body)).toBe(201);
    expect(first.body.data).toMatchObject({ indicator: { id: ids.cups, name: "Cup terjual", type: "count", unit: "cup" }, quantity: "40", note: "Shift pagi", status: "pending", editable: true, photo: { contentType: "image/png", size: PNG.length } });
    expect((await logTask(karyawan, { workDate: TODAY, indicatorId: ids.cups, quantity: "46" })).status).toBe(201);
    expect((await logTask(karyawan, { workDate: TODAY, indicatorId: ids.sales, quantity: "1250000.50" })).status).toBe(201);
    const other = await logTask(karyawan, { workDate: TODAY, indicatorId: "", quantity: "", note: "Membersihkan mesin espresso" });
    expect(other.status, JSON.stringify(other.body)).toBe(201);
    expect(other.body.data).toMatchObject({ indicator: null, quantity: null, note: "Membersihkan mesin espresso" });

    const day = await get(karyawan, "/tasks/me");
    expect(day.body.data).toMatchObject({ checkedIn: true, canLog: true, otherCount: 1 });
    expect(day.body.data.indicators).toMatchObject([
      { id: ids.cups, total: "86", target: "120", targetPeriod: "daily", entryCount: 2, pendingCount: 2 },
      { id: ids.sales, total: "1250000.5", target: "5000000", targetPeriod: "weekly", entryCount: 1 },
    ]);
    expect(day.body.data.logs).toHaveLength(4);
    expect(day.body.data.days[0]).toEqual({ date: TODAY, checkedIn: true, count: 4 });

    const photoId: string = first.body.data.id;
    for (const token of [karyawan, atasan, owner]) {
      const file = await get(token, `/tasks/logs/${photoId}/photo`).buffer(true);
      expect(file.status).toBe(200);
      expect(file.headers["content-type"]).toBe("image/png");
      expect(Buffer.compare(file.body, PNG)).toBe(0);
    }
    // Tenant lain tidak melihat catatan ini sama sekali
    const outsider = await createWorkspace("Usaha Lain");
    await addEmployee(outsider, outsider.userIds.karyawan);
    const outsiderOwner = await tokenOf(outsider, "owner");
    expect((await get(outsiderOwner, `/tasks/logs/${photoId}/photo`)).status).toBe(404);
    expect((await deleteTask(await tokenOf(outsider, "karyawan"), photoId)).status).toBe(404);
  });

  it("validasi: bilangan bulat untuk jumlah, indikator template sendiri, jendela 7 hari, deskripsi pekerjaan lain", async () => {
    setNow();
    const ws = await createWorkspace("Kopi Validasi");
    const employeeId = await addEmployee(ws, ws.userIds.karyawan);
    const owner = await tokenOf(ws, "owner");
    const karyawan = await tokenOf(ws, "karyawan");
    const ids = await createTemplate(ws, owner);
    await checkIn(ws, employeeId, TODAY);
    await checkIn(ws, employeeId, "2026-09-28");
    await checkIn(ws, employeeId, "2026-09-27");

    expect((await logTask(karyawan, { workDate: TODAY, indicatorId: ids.cups, quantity: "2.5" })).status).toBe(400);
    expect((await logTask(karyawan, { workDate: TODAY, indicatorId: ids.cups, quantity: "0" })).status).toBe(400);
    expect((await logTask(karyawan, { workDate: TODAY, indicatorId: ids.cups })).status).toBe(400);
    // Penilaian atasan tidak dicatat karyawan
    expect((await logTask(karyawan, { workDate: TODAY, indicatorId: ids.rating, quantity: "5" })).status).toBe(400);
    // Indikator template lain (bawaan, tidak dipasang ke jabatan ini)
    const overview = await get(owner, "/kpi/templates");
    const foreign: string = overview.body.data.templates.find((template: { name: string }) => template.name === "Sales").indicators[0].id;
    expect((await logTask(karyawan, { workDate: TODAY, indicatorId: foreign, quantity: "1" })).status).toBe(400);
    expect((await logTask(karyawan, { workDate: TODAY, note: "ok" })).status).toBe(400);
    expect((await logTask(karyawan, { workDate: TODAY, quantity: "3", note: "Pekerjaan lain" })).status).toBe(400);
    // Jendela: 28 Sep (7 hari lalu) boleh, 27 Sep & besok ditolak
    expect((await logTask(karyawan, { workDate: "2026-09-28", note: "Stok opname" })).status).toBe(201);
    expect((await logTask(karyawan, { workDate: "2026-09-27", note: "Stok opname" })).status).toBe(400);
    expect((await logTask(karyawan, { workDate: "2026-10-06", note: "Stok opname" })).status).toBe(400);
    // Foto bukan gambar
    const pdf = { buffer: Buffer.from("%PDF-1.4 test"), filename: "struk.jpg", contentType: "image/jpeg" };
    expect((await logTask(karyawan, { workDate: TODAY, note: "Dengan foto" }, pdf)).status).toBe(400);

    // Akun belum tertaut data karyawan → tidak bisa mencatat
    const admin = await tokenOf(ws, "admin");
    expect((await get(admin, "/tasks/me")).body.data).toMatchObject({ access: "not_linked", canLog: false });
    expect((await logTask(admin, { workDate: TODAY, note: "Pekerjaan admin" })).status).toBe(403);
  });

  it("ubah & hapus hanya selama menunggu verifikasi; foto diganti/dihapus", async () => {
    setNow();
    const ws = await createWorkspace("Kopi Ubah");
    const employeeId = await addEmployee(ws, ws.userIds.karyawan);
    const owner = await tokenOf(ws, "owner");
    const karyawan = await tokenOf(ws, "karyawan");
    const ids = await createTemplate(ws, owner);
    await checkIn(ws, employeeId, TODAY);

    const created = await logTask(karyawan, { workDate: TODAY, indicatorId: ids.cups, quantity: "10" }, { buffer: PNG, filename: "a.png", contentType: "image/png" });
    const id: string = created.body.data.id;

    const replaced = await editTask(karyawan, id, { indicatorId: ids.cups, quantity: "12", note: "Direvisi" }, { buffer: JPEG, filename: "b.jpg", contentType: "image/jpeg" });
    expect(replaced.status, JSON.stringify(replaced.body)).toBe(200);
    expect(replaced.body.data).toMatchObject({ quantity: "12", note: "Direvisi", photo: { contentType: "image/jpeg", size: JPEG.length } });
    const photo = await get(karyawan, `/tasks/logs/${id}/photo`).buffer(true);
    expect(Buffer.compare(photo.body, JPEG)).toBe(0);

    // Tanpa foto baru & tanpa removePhoto → foto tetap
    const kept = await editTask(karyawan, id, { indicatorId: ids.cups, quantity: "13" });
    expect(kept.body.data.photo).toMatchObject({ contentType: "image/jpeg" });
    // Menjadi pekerjaan lain + hapus foto
    const converted = await editTask(karyawan, id, { indicatorId: "", quantity: "", note: "Ternyata membantu kasir", removePhoto: "true" });
    expect(converted.status, JSON.stringify(converted.body)).toBe(200);
    expect(converted.body.data).toMatchObject({ indicator: null, quantity: null, photo: null });
    expect((await get(karyawan, `/tasks/logs/${id}/photo`)).status).toBe(404);

    // Sudah diverifikasi (feature 20) → terkunci
    await withTenant(db, { tenantId: ws.tenantId, userId: null }, (tx) => tx.update(taskLogs).set({ status: "approved" }).where(eq(taskLogs.id, id)));
    expect((await editTask(karyawan, id, { note: "Ubah lagi" })).status).toBe(409);
    expect((await deleteTask(karyawan, id)).status).toBe(409);
    expect((await get(karyawan, "/tasks/me")).body.data.logs[0]).toMatchObject({ id, status: "approved", editable: false });

    const removable = await logTask(karyawan, { workDate: TODAY, note: "Salah catat" });
    expect((await deleteTask(karyawan, removable.body.data.id)).status).toBe(200);
    expect((await get(karyawan, "/tasks/me")).body.data.logs).toHaveLength(1);
  });

  it("indikator yang sudah punya log tidak bisa dihapus / diganti tipenya; templatenya tidak bisa dihapus", async () => {
    setNow();
    const ws = await createWorkspace("Kopi Template");
    const employeeId = await addEmployee(ws, ws.userIds.karyawan);
    const owner = await tokenOf(ws, "owner");
    const karyawan = await tokenOf(ws, "karyawan");
    const ids = await createTemplate(ws, owner);
    await checkIn(ws, employeeId, TODAY);
    expect((await logTask(karyawan, { workDate: TODAY, indicatorId: ids.cups, quantity: "5" })).status).toBe(201);

    const base = TEMPLATE_BODY(ws.positionId);
    const [cupsBody, salesBody, ratingBody] = base.indicators;
    const withIds = [
      { ...cupsBody, id: ids.cups },
      { ...salesBody, id: ids.sales },
      { ...ratingBody, id: ids.rating },
    ] as const;
    const put = (indicators: object[]) =>
      request(server).put(`/kpi/templates/${ids.templateId}`).set("Authorization", `Bearer ${owner}`).send({ ...base, indicators });

    // Hapus "Cup terjual" (bobotnya dipindah ke penjualan)
    const removed = await put([{ ...withIds[1], weight: 80 }, withIds[2]]);
    expect(removed.status).toBe(409);
    expect(removed.body.error).toContain("Cup terjual");
    // Ganti tipe jumlah → angka
    expect((await put([{ ...withIds[0], type: "numeric" }, withIds[1], withIds[2]])).status).toBe(409);
    // Ubah nama/target tetap boleh; indikator tanpa log boleh dihapus
    const renamed = await put([{ ...withIds[0], name: "Cup kopi terjual", target: "150", weight: 60 }, { ...withIds[1], weight: 40 }]);
    expect(renamed.status, JSON.stringify(renamed.body)).toBe(200);

    expect((await request(server).delete(`/kpi/templates/${ids.templateId}`).set("Authorization", `Bearer ${owner}`)).status).toBe(409);
    const day = await get(karyawan, "/tasks/me");
    expect(day.body.data.logs[0].indicator).toMatchObject({ name: "Cup kopi terjual" });
  });
});

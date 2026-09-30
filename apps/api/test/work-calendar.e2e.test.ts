import "reflect-metadata";
import { randomUUID } from "node:crypto";

import * as schema from "@exapay/db";
import { auditLogs, memberships, tenants, users } from "@exapay/db";
import { DEFAULT_WORK_SCHEDULE, type MembershipRole } from "@exapay/shared";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { hash } from "@node-rs/argon2";
import { and, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";

import { AppModule } from "../src/app.module.js";
import { configureApp } from "../src/app.setup.js";
import { type Database, withTenant, withUser } from "../src/database/tenant-transaction.js";
import { seedTenantDefaults } from "../src/modules/tenants/tenant-defaults.js";

// Verifikasi feature 13 (API): jadwal kerja, hari libur, hitung hari kerja.

const PASSWORD = "password-calendar-123";

let app: INestApplication;
let server: Parameters<typeof request>[0];
let pool: pg.Pool;
let db: Database;

type Workspace = { tenantId: string; tokens: Record<MembershipRole, string> };

// Tenant dibuat seperti signup/super-admin: termasuk seedTenantDefaults (jadwal bawaan)
async function createWorkspace(name: string): Promise<Workspace> {
  const tenantId = randomUUID();
  const passwordHash = await hash(PASSWORD);
  const emails: Record<MembershipRole, string> = { owner: "", admin: "", atasan: "", karyawan: "" };
  for (const role of ["owner", "admin", "atasan", "karyawan"] as const) {
    const id = randomUUID();
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
  const tokens: Record<MembershipRole, string> = { owner: "", admin: "", atasan: "", karyawan: "" };
  for (const role of ["owner", "admin", "atasan", "karyawan"] as const) {
    const res = await request(server).post("/auth/login").send({ email: emails[role], password: PASSWORD, client: "mobile" });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    tokens[role] = res.body.data.tokens.accessToken;
  }
  return { tenantId, tokens };
}

function get(token: string, path: string): request.Test {
  return request(server).get(path).set("Authorization", `Bearer ${token}`);
}

function put(token: string, path: string, body: object): request.Test {
  return request(server).put(path).set("Authorization", `Bearer ${token}`).send(body);
}

function post(token: string, path: string, body: object): request.Test {
  return request(server).post(path).set("Authorization", `Bearer ${token}`).send(body);
}

type Day = { weekday: number; isWorkday: boolean; startTime: string; endTime: string };

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: inject("testDatabaseUrl") });
  db = drizzle({ client: pool, schema });
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();
  server = app.getHttpServer();
});

afterAll(async () => {
  await app?.close();
  await pool?.end();
});

describe("jadwal kerja", () => {
  it("hanya owner/admin", async () => {
    const ws = await createWorkspace("Toko Jadwal Akses");
    expect((await get(ws.tokens.admin, "/attendance/schedule")).status).toBe(200);
    expect((await get(ws.tokens.atasan, "/attendance/schedule")).status).toBe(403);
    expect((await get(ws.tokens.karyawan, "/attendance/schedule")).status).toBe(403);
    expect((await get(ws.tokens.atasan, "/attendance/holidays?year=2026")).status).toBe(403);
    expect((await get(ws.tokens.karyawan, "/attendance/working-days?from=2026-09-01&to=2026-09-30")).status).toBe(403);
  });

  it("usaha baru memakai jadwal bawaan; ubah jadwal + audit; validasi", async () => {
    const ws = await createWorkspace("Toko Jadwal Ubah");
    const token = ws.tokens.owner;
    const initial = await get(token, "/attendance/schedule");
    expect(initial.status).toBe(200);
    expect(initial.body.data.days).toEqual(DEFAULT_WORK_SCHEDULE);
    expect(initial.body.data.updatedAt).not.toBeNull();

    // Sabtu setengah hari
    const days: Day[] = DEFAULT_WORK_SCHEDULE.map((d) => (d.weekday === 6 ? { ...d, isWorkday: true, endTime: "13:00" } : { ...d }));
    const saved = await put(token, "/attendance/schedule", { days });
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
    expect(saved.body.data.days[5]).toEqual({ weekday: 6, isWorkday: true, startTime: "08:00", endTime: "13:00" });
    // Simpan ulang tanpa perubahan → tidak ada audit baru
    expect((await put(token, "/attendance/schedule", { days })).status).toBe(200);

    const september = await get(token, "/attendance/working-days?from=2026-09-01&to=2026-09-30");
    expect(september.body.data).toEqual({ from: "2026-09-01", to: "2026-09-30", workingDays: 26, holidaysOnWorkdays: 0 });

    const audit = await withTenant(db, { tenantId: ws.tenantId, userId: null }, (tx) =>
      tx
        .select({ action: auditLogs.action, before: auditLogs.before, after: auditLogs.after })
        .from(auditLogs)
        .where(and(eq(auditLogs.tenantId, ws.tenantId), eq(auditLogs.entity, "work_schedule"))),
    );
    expect(audit).toEqual([
      {
        action: "update",
        before: [{ weekday: 6, isWorkday: false, startTime: "08:00", endTime: "17:00" }],
        after: [{ weekday: 6, isWorkday: true, startTime: "08:00", endTime: "13:00" }],
      },
    ]);

    const reversed = await put(token, "/attendance/schedule", { days: days.map((d) => (d.weekday === 1 ? { ...d, startTime: "17:00", endTime: "08:00" } : d)) });
    expect(reversed.status).toBe(400);
    expect(reversed.body.error).toBe("Jam pulang harus setelah jam masuk");
    const allOff = await put(token, "/attendance/schedule", { days: days.map((d) => ({ ...d, isWorkday: false })) });
    expect(allOff.body.error).toBe("Minimal satu hari kerja dalam seminggu");
    expect((await put(token, "/attendance/schedule", { days: days.slice(0, 6) })).status).toBe(400);
    expect((await put(token, "/attendance/schedule", { days: days.map((d) => ({ ...d, weekday: 1 })) })).status).toBe(400);
    expect((await put(token, "/attendance/schedule", { days: days.map((d) => ({ ...d, startTime: "8:00" })) })).status).toBe(400);
  });
});

describe("hari libur", () => {
  it("libur nasional 2026 dari SKB, semua diikuti; tetap masuk di satu tanggal mengubah hari kerja", async () => {
    const ws = await createWorkspace("Toko Libur Nasional");
    const token = ws.tokens.owner;
    const overview = await get(token, "/attendance/holidays?year=2026");
    expect(overview.status).toBe(200);
    const data = overview.body.data;
    expect(data.year).toBe(2026);
    expect(data.nationalYears).toEqual(expect.arrayContaining([2026, 2027]));
    expect(data.national).toHaveLength(25);
    expect(data.national.filter((h: { kind: string }) => h.kind === "cuti_bersama")).toHaveLength(8);
    expect(data.national.every((h: { observed: boolean }) => h.observed)).toBe(true);
    expect(data.company).toEqual([]);
    // Maret 2026 Senin–Jumat: 22 hari − Nyepi & Idulfitri di hari kerja (18, 19, 20, 23, 24) = 17
    expect(data.workingDaysByMonth[2]).toBe(17);

    const work = await put(token, "/attendance/national-holidays/2026-03-20", { observed: false });
    expect(work.status).toBe(200);
    expect(work.body.data).toEqual({ date: "2026-03-20", name: "Cuti Bersama Idulfitri 1447 H", kind: "cuti_bersama", observed: false });
    // Idempoten
    expect((await put(token, "/attendance/national-holidays/2026-03-20", { observed: false })).status).toBe(200);
    const after = (await get(token, "/attendance/holidays?year=2026")).body.data;
    expect(after.workingDaysByMonth[2]).toBe(18);
    expect(after.national.find((h: { date: string }) => h.date === "2026-03-20").observed).toBe(false);
    const range = await get(token, "/attendance/working-days?from=2026-03-01&to=2026-03-31");
    expect(range.body.data).toEqual({ from: "2026-03-01", to: "2026-03-31", workingDays: 18, holidaysOnWorkdays: 4 });

    expect((await put(token, "/attendance/national-holidays/2026-03-20", { observed: true })).status).toBe(200);
    expect((await get(token, "/attendance/holidays?year=2026")).body.data.workingDaysByMonth[2]).toBe(17);

    expect((await put(token, "/attendance/national-holidays/2026-03-25", { observed: false })).status).toBe(404);
    expect((await put(token, "/attendance/national-holidays/2026-02-30", { observed: false })).status).toBe(404);
    expect((await put(token, "/attendance/national-holidays/2026-03-20", {})).status).toBe(400);
    expect((await get(token, "/attendance/holidays?year=abc")).status).toBe(400);
    expect((await get(token, "/attendance/holidays?year=1999")).status).toBe(400);

    const audit = await withTenant(db, { tenantId: ws.tenantId, userId: null }, (tx) =>
      tx
        .select({ action: auditLogs.action, entityId: auditLogs.entityId })
        .from(auditLogs)
        .where(and(eq(auditLogs.tenantId, ws.tenantId), eq(auditLogs.entity, "national_holiday")))
        .orderBy(auditLogs.createdAt),
    );
    expect(audit).toEqual([
      { action: "work", entityId: "2026-03-20" },
      { action: "observe", entityId: "2026-03-20" },
    ]);
  });

  it("tahun tanpa data libur nasional → daftar kosong, hari kerja tetap dihitung dari jadwal", async () => {
    const ws = await createWorkspace("Toko Libur 2030");
    const data = (await get(ws.tokens.owner, "/attendance/holidays?year=2030")).body.data;
    expect(data.national).toEqual([]);
    expect(data.workingDaysByMonth.reduce((a: number, b: number) => a + b, 0)).toBe(261);
  });

  it("libur usaha: tambah, ubah, hapus, tanggal ganda, validasi + audit", async () => {
    const ws = await createWorkspace("Toko Libur Usaha");
    const token = ws.tokens.admin;
    const created = await post(token, "/attendance/company-holidays", { date: "2026-09-30", name: "  Ulang tahun toko  " });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    expect(created.body.data).toMatchObject({ date: "2026-09-30", name: "Ulang tahun toko" });
    const id: string = created.body.data.id;

    expect((await get(token, "/attendance/working-days?from=2026-09-01&to=2026-09-30")).body.data.workingDays).toBe(21);

    const dup = await post(token, "/attendance/company-holidays", { date: "2026-09-30", name: "Lain" });
    expect(dup.status).toBe(409);
    expect(dup.body.error).toBe("Sudah ada libur usaha di tanggal ini");
    expect((await post(token, "/attendance/company-holidays", { date: "2026-02-30", name: "Salah" })).body.error).toBe("Tanggal tidak valid");
    expect((await post(token, "/attendance/company-holidays", { date: "2026-10-01", name: "A" })).status).toBe(400);

    const moved = await put(token, `/attendance/company-holidays/${id}`, { date: "2026-10-02", name: "Ulang tahun toko" });
    expect(moved.status).toBe(200);
    const overview = (await get(token, "/attendance/holidays?year=2026")).body.data;
    expect(overview.company).toEqual([{ id, date: "2026-10-02", name: "Ulang tahun toko" }]);
    expect(overview.workingDaysByMonth[8]).toBe(22);

    expect((await request(server).delete(`/attendance/company-holidays/${id}`).set("Authorization", `Bearer ${token}`)).status).toBe(200);
    expect((await request(server).delete(`/attendance/company-holidays/${id}`).set("Authorization", `Bearer ${token}`)).status).toBe(404);
    expect((await request(server).delete("/attendance/company-holidays/bukan-uuid").set("Authorization", `Bearer ${token}`)).status).toBe(404);

    const audit = await withTenant(db, { tenantId: ws.tenantId, userId: null }, (tx) =>
      tx
        .select({ action: auditLogs.action, before: auditLogs.before, after: auditLogs.after })
        .from(auditLogs)
        .where(and(eq(auditLogs.tenantId, ws.tenantId), inArray(auditLogs.entity, ["company_holiday"])))
        .orderBy(auditLogs.createdAt),
    );
    expect(audit).toEqual([
      { action: "create", before: null, after: { date: "2026-09-30", name: "Ulang tahun toko" } },
      { action: "update", before: { date: "2026-09-30", name: "Ulang tahun toko" }, after: { date: "2026-10-02", name: "Ulang tahun toko" } },
      { action: "delete", before: { date: "2026-10-02", name: "Ulang tahun toko" }, after: null },
    ]);
  });

  it("rentang hitung hari kerja divalidasi", async () => {
    const ws = await createWorkspace("Toko Rentang");
    const token = ws.tokens.owner;
    expect((await get(token, "/attendance/working-days?from=2026-09-30&to=2026-09-01")).status).toBe(400);
    expect((await get(token, "/attendance/working-days?from=2026-01-01&to=2028-12-31")).body.error).toBe("Rentang maksimal 2 tahun");
    expect((await get(token, "/attendance/working-days?from=2026-01-01")).status).toBe(400);
  });

  it("isolasi antar usaha: jadwal, libur usaha, pilihan libur nasional", async () => {
    const a = await createWorkspace("Toko Kalender A");
    const b = await createWorkspace("Toko Kalender B");
    const days = DEFAULT_WORK_SCHEDULE.map((d) => ({ ...d, isWorkday: true }));
    expect((await put(a.tokens.owner, "/attendance/schedule", { days })).status).toBe(200);
    const holiday = await post(a.tokens.owner, "/attendance/company-holidays", { date: "2026-11-11", name: "Libur A" });
    expect((await put(a.tokens.owner, "/attendance/national-holidays/2026-08-17", { observed: false })).status).toBe(200);

    expect((await get(b.tokens.owner, "/attendance/schedule")).body.data.days).toEqual(DEFAULT_WORK_SCHEDULE);
    const bOverview = (await get(b.tokens.owner, "/attendance/holidays?year=2026")).body.data;
    expect(bOverview.company).toEqual([]);
    expect(bOverview.national.every((h: { observed: boolean }) => h.observed)).toBe(true);
    const id: string = holiday.body.data.id;
    expect((await put(b.tokens.owner, `/attendance/company-holidays/${id}`, { date: "2026-11-12", name: "Diambil B" })).status).toBe(404);
    expect((await request(server).delete(`/attendance/company-holidays/${id}`).set("Authorization", `Bearer ${b.tokens.owner}`)).status).toBe(404);
    expect((await get(a.tokens.owner, "/attendance/holidays?year=2026")).body.data.company).toHaveLength(1);
  });
});

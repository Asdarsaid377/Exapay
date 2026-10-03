import "reflect-metadata";
import { randomUUID } from "node:crypto";

import * as schema from "@exapay/db";
import { auditLogs, departments, employees, employeeSalaries, memberships, positions, tenants, users } from "@exapay/db";
import type { MembershipRole } from "@exapay/shared";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { hash } from "@node-rs/argon2";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";

import { AppModule } from "../src/app.module.js";
import { configureApp } from "../src/app.setup.js";
import { type Database, withTenant, withUser } from "../src/database/tenant-transaction.js";
import { seedTenantDefaults } from "../src/modules/tenants/tenant-defaults.js";

// Verifikasi feature 48 (API): langkah panduan setup dihitung dari data usaha (0/7 → 7/7), "jadwal sudah dicek",
// lewati & buka lagi berlaku untuk seluruh usaha, tutup hanya setelah selesai, audit, peran, isolasi tenant.

const PASSWORD = "password-setup-123";
const ROLES = ["owner", "admin", "atasan", "karyawan"] as const;
const MAKASSAR = "73.71";

let app: INestApplication;
let server: Parameters<typeof request>[0];
let pool: pg.Pool;
let db: Database;

type Workspace = { tenantId: string; emails: Record<MembershipRole, string>; userIds: Record<MembershipRole, string> };

// Usaha baru seperti hasil signup: data bawaan (jadwal, komponen gaji, template KPI), kota terisi, tanggal gajian kosong,
// tanpa departemen/jabatan/karyawan
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
  return { tenantId, emails, userIds };
}

async function tokenOf(ws: Workspace, role: MembershipRole): Promise<string> {
  const res = await request(server).post("/auth/login").send({ email: ws.emails[role], password: PASSWORD, client: "mobile" });
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body.data.tokens.accessToken;
}

const get = (token: string, path: string): request.Test => request(server).get(path).set("Authorization", `Bearer ${token}`);
const post = (token: string, path: string, body: object = {}): request.Test => request(server).post(path).set("Authorization", `Bearer ${token}`).send(body);
const put = (token: string, path: string, body: object): request.Test => request(server).put(path).set("Authorization", `Bearer ${token}`).send(body);

function doneKeys(body: { data: { steps: { key: string; done: boolean }[] } }): string[] {
  return body.data.steps.filter((step) => step.done).map((step) => step.key);
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

afterAll(async () => {
  await app?.close();
  await pool?.end();
});

describe("panduan setup", () => {
  it("langkah selesai dari data, jadwal dicek, tutup setelah semua selesai, audit", async () => {
    const ws = await createWorkspace("Setup Langkah");
    const owner = await tokenOf(ws, "owner");
    const ctx = { tenantId: ws.tenantId, userId: null };

    const fresh = await get(owner, "/setup-guide");
    expect(fresh.status, JSON.stringify(fresh.body)).toBe(200);
    expect(fresh.body.data).toMatchObject({ completedCount: 0, totalCount: 7, allDone: false, hidden: false, closed: false, employeeWithoutSalaryId: null });
    expect(fresh.body.data.steps.map((step: { key: string }) => step.key)).toEqual([
      "company_profile",
      "organization",
      "work_schedule",
      "employees",
      "salaries",
      "portal_accounts",
      "first_payroll",
    ]);

    // 1 profil (kota sudah, tanggal gajian belum) · 2 organisasi
    await withTenant(db, ctx, async (tx) => {
      await tx.update(tenants).set({ payday: 25 }).where(eq(tenants.id, ws.tenantId));
      await tx.insert(departments).values({ tenantId: ws.tenantId, name: "Operasional" });
    });
    expect(doneKeys((await get(owner, "/setup-guide")).body)).toEqual(["company_profile"]);
    const position = await withTenant(db, ctx, async (tx) => {
      const [row] = await tx.insert(positions).values({ tenantId: ws.tenantId, name: "Barista" }).returning({ id: positions.id });
      return row;
    });

    // 3 jadwal bawaan belum dianggap dicek sampai ditandai
    expect(doneKeys((await get(owner, "/setup-guide")).body)).toEqual(["company_profile", "organization"]);
    const checked = await post(owner, "/setup-guide/schedule-checked");
    expect(checked.status).toBe(200);
    expect(doneKeys(checked.body)).toEqual(["company_profile", "organization", "work_schedule"]);

    // 4 karyawan · 5 gaji (sub-progres) · 6 akun portal
    const [department] = await withTenant(db, ctx, (tx) => tx.select({ id: departments.id }).from(departments));
    if (!department || !position) throw new Error("fixture organisasi gagal");
    const base = { tenantId: ws.tenantId, departmentId: department.id, positionId: position.id, joinDate: "2026-01-01", employmentStatus: "permanent" as const, ptkpStatus: "TK/0" as const };
    const ids = { ani: randomUUID(), budi: randomUUID(), lama: randomUUID() };
    await withTenant(db, ctx, (tx) =>
      tx.insert(employees).values([
        { ...base, id: ids.ani, fullName: "Ani Setup" },
        { ...base, id: ids.budi, fullName: "Budi Setup", userId: ws.userIds.karyawan },
        // Karyawan keluar tidak dihitung
        { ...base, id: ids.lama, fullName: "Lama Setup", endDate: "2026-06-30" },
      ]),
    );
    const staffed = (await get(owner, "/setup-guide")).body;
    expect(doneKeys(staffed)).toEqual(["company_profile", "organization", "work_schedule", "employees", "portal_accounts"]);
    const progressOf = (key: string) => staffed.data.steps.find((step: { key: string }) => step.key === key)?.progress;
    expect(progressOf("salaries")).toEqual({ done: 0, total: 2 });
    expect(progressOf("portal_accounts")).toEqual({ done: 1, total: 2 });
    expect(staffed.data.employeeWithoutSalaryId).toBe(ids.ani);

    const salary = { tenantId: ws.tenantId, effectiveFrom: "2026-10-01", bpjsKesehatan: true, bpjsJht: true, bpjsJp: false, bpjsJkk: true, bpjsJkm: true };
    await withTenant(db, ctx, (tx) => tx.insert(employeeSalaries).values({ ...salary, employeeId: ids.ani }));
    expect((await get(owner, "/setup-guide")).body.data.employeeWithoutSalaryId).toBe(ids.budi);
    // Versi gaji yang sudah ditutup tidak dihitung
    await withTenant(db, ctx, (tx) => tx.insert(employeeSalaries).values({ ...salary, employeeId: ids.budi, effectiveFrom: "2026-01-01", effectiveTo: "2026-09-30" }));
    expect(doneKeys((await get(owner, "/setup-guide")).body)).not.toContain("salaries");
    await withTenant(db, ctx, (tx) => tx.insert(employeeSalaries).values({ ...salary, employeeId: ids.budi }));
    expect(doneKeys((await get(owner, "/setup-guide")).body)).toContain("salaries");

    // Tutup sebelum selesai ditolak; 7 periode gaji pertama → selesai → tutup
    expect((await post(owner, "/setup-guide/close")).status).toBe(409);
    const run = await post(owner, "/payroll/runs", { month: "2026-10" });
    expect(run.status, JSON.stringify(run.body)).toBe(201);
    const finished = (await get(owner, "/setup-guide")).body.data;
    expect(finished).toMatchObject({ completedCount: 7, allDone: true, closed: false });
    const closed = await post(owner, "/setup-guide/close");
    expect(closed.status).toBe(200);
    expect(closed.body.data.closed).toBe(true);

    const audit = await withTenant(db, ctx, (tx) =>
      tx.select({ action: auditLogs.action }).from(auditLogs).where(and(eq(auditLogs.entity, "setup_guide"), eq(auditLogs.entityId, ws.tenantId))),
    );
    expect(audit.map((row) => row.action).sort()).toEqual(["close", "schedule_checked"]);
  });

  it("menyimpan jadwal yang diubah menandai langkah jadwal selesai", async () => {
    const ws = await createWorkspace("Setup Jadwal");
    const owner = await tokenOf(ws, "owner");
    const schedule = await get(owner, "/attendance/schedule");
    expect(schedule.status, JSON.stringify(schedule.body)).toBe(200);
    const days = schedule.body.data.days.map((day: { weekday: number; isWorkday: boolean; startTime: string; endTime: string }) =>
      day.weekday === 6 ? { ...day, isWorkday: true, startTime: "08:00", endTime: "13:00" } : day,
    );
    expect((await put(owner, "/attendance/schedule", { days })).status).toBe(200);
    expect(doneKeys((await get(owner, "/setup-guide")).body)).toContain("work_schedule");
  });

  it("lewati & buka lagi berlaku untuk seluruh usaha; atasan & karyawan ditolak; isolasi tenant", async () => {
    const ws = await createWorkspace("Setup Lewati");
    const other = await createWorkspace("Setup Lain");
    const owner = await tokenOf(ws, "owner");
    const admin = await tokenOf(ws, "admin");

    const hidden = await put(owner, "/setup-guide/visibility", { hidden: true });
    expect(hidden.status).toBe(200);
    expect(hidden.body.data.hidden).toBe(true);
    expect((await get(admin, "/setup-guide")).body.data.hidden).toBe(true);
    expect((await get(await tokenOf(other, "owner"), "/setup-guide")).body.data.hidden).toBe(false);

    const shown = await put(admin, "/setup-guide/visibility", { hidden: false });
    expect(shown.body.data.hidden).toBe(false);
    expect((await put(owner, "/setup-guide/visibility", { hidden: "ya" })).status).toBe(400);

    expect((await get(await tokenOf(ws, "atasan"), "/setup-guide")).status).toBe(403);
    expect((await put(await tokenOf(ws, "karyawan"), "/setup-guide/visibility", { hidden: true })).status).toBe(403);

    const audit = await withTenant(db, { tenantId: ws.tenantId, userId: null }, (tx) =>
      tx.select({ action: auditLogs.action }).from(auditLogs).where(and(eq(auditLogs.entity, "setup_guide"), eq(auditLogs.entityId, ws.tenantId))),
    );
    expect(audit.map((row) => row.action).sort()).toEqual(["hide", "show"]);
  });
});

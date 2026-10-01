import "reflect-metadata";
import { randomUUID } from "node:crypto";

import * as schema from "@exapay/db";
import { auditLogs, departments, employees, employeeSalaries, employeeSalaryItems, memberships, positions, salaryComponents, tenants, users } from "@exapay/db";
import type { EmployeeSalaryOverview, MembershipRole, SalaryComponent, SalaryComponentSettings } from "@exapay/shared";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { hash } from "@node-rs/argon2";
import { asc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, inject, it, vi } from "vitest";

import { AppModule } from "../src/app.module.js";
import { configureApp } from "../src/app.setup.js";
import { type Database, withTenant, withUser } from "../src/database/tenant-transaction.js";
import { seedTenantDefaults } from "../src/modules/tenants/tenant-defaults.js";

// Verifikasi feature 28 (API): katalog komponen gaji per usaha + gaji karyawan berlaku-tanggal (versi baru menutup /
// menggantikan versi lama), kepesertaan BPJS, kelompok risiko JKK. Owner/admin saja; isi versi immutable di database.

const PASSWORD = "password-salary-123";
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

async function addEmployee(ws: Workspace, fullName: string, joinDate = "2026-09-15"): Promise<string> {
  const id = randomUUID();
  await withTenant(db, { tenantId: ws.tenantId, userId: null }, (tx) =>
    tx.insert(employees).values({
      id,
      tenantId: ws.tenantId,
      fullName,
      departmentId: ws.departmentId,
      positionId: ws.positionId,
      joinDate,
      employmentStatus: "permanent",
      ptkpStatus: "TK/0",
    }),
  );
  return id;
}

async function tokenOf(ws: Workspace, role: MembershipRole): Promise<string> {
  const res = await request(server).post("/auth/login").send({ email: ws.emails[role], password: PASSWORD, client: "mobile" });
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body.data.tokens.accessToken;
}

function send(method: "get" | "post" | "put" | "delete", token: string, path: string, body?: object): request.Test {
  const req = request(server)[method](path).set("Authorization", `Bearer ${token}`);
  return body ? req.send(body) : req;
}

async function dbError(promise: Promise<unknown>): Promise<string> {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  const messages: string[] = [];
  for (let current: unknown = error; current instanceof Error; current = current.cause) messages.push(current.message);
  return messages.join(" | ");
}

function componentByName(settings: SalaryComponentSettings, name: string): SalaryComponent {
  const component = settings.components.find((candidate) => candidate.name === name);
  if (!component) throw new Error(`komponen ${name} tidak ada`);
  return component;
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

describe("katalog komponen gaji", () => {
  it("usaha baru mendapat komponen bawaan + kelompok risiko JKK 1", async () => {
    const ws = await createWorkspace("Kopi Katalog");
    const res = await send("get", await tokenOf(ws, "admin"), "/salary-components");
    expect(res.status).toBe(200);
    const settings: SalaryComponentSettings = res.body.data;
    expect(settings.jkkRiskLevel).toBe(1);
    expect(settings.components.map((c) => [c.name, c.kind, c.builtin, c.archived, c.inUse])).toEqual([
      ["Gaji Pokok", "base_salary", true, false, false],
      ["Tunjangan Jabatan", "fixed_allowance", true, false, false],
      ["Uang Makan", "variable_allowance", true, false, false],
      ["Uang Transport", "variable_allowance", true, false, false],
      ["Tunjangan Kehadiran", "attendance_allowance", true, false, false],
      ["Insentif", "variable_allowance", true, false, false],
      ["THR", "variable_allowance", true, false, false],
      ["Cicilan Pinjaman", "deduction", true, false, false],
    ]);
  });

  it("tambah, ubah, arsipkan, pulihkan, hapus — dengan batasan gaji pokok & nama unik", async () => {
    const ws = await createWorkspace("Kopi Ubah");
    const owner = await tokenOf(ws, "owner");

    const created = await send("post", owner, "/salary-components", { name: "Tunjangan Keluarga", kind: "fixed_allowance" });
    expect(created.status).toBe(201);
    const family = componentByName(created.body.data, "Tunjangan Keluarga");
    expect(created.body.data.components.at(-1).name).toBe("Tunjangan Keluarga");

    expect((await send("post", owner, "/salary-components", { name: "tunjangan keluarga", kind: "deduction" })).status).toBe(409);
    expect((await send("post", owner, "/salary-components", { name: "Gaji Pokok 2", kind: "base_salary" })).status).toBe(409);
    expect((await send("post", owner, "/salary-components", { name: "Kehadiran 2", kind: "attendance_allowance" })).status).toBe(409);
    expect((await send("post", owner, "/salary-components", { name: "  ", kind: "deduction" })).status).toBe(400);

    // Belum dipakai → jenis boleh diubah
    const updated = await send("put", owner, `/salary-components/${family.id}`, { name: "Tunjangan Anak", kind: "variable_allowance" });
    expect(updated.status).toBe(200);
    expect(componentByName(updated.body.data, "Tunjangan Anak").kind).toBe("variable_allowance");

    const base = componentByName(updated.body.data, "Gaji Pokok");
    expect((await send("put", owner, `/salary-components/${base.id}`, { name: "Gaji Pokok", kind: "fixed_allowance" })).status).toBe(400);
    expect((await send("post", owner, `/salary-components/${base.id}/archive`)).status).toBe(400);
    expect((await send("delete", owner, `/salary-components/${base.id}`)).status).toBe(400);
    // Nama gaji pokok boleh diubah
    expect((await send("put", owner, `/salary-components/${base.id}`, { name: "Upah Pokok", kind: "base_salary" })).status).toBe(200);

    // Arsip tunjangan kehadiran → boleh membuat tunjangan kehadiran baru; pulihkan yang lama ditolak (sudah ada yang aktif)
    const settings: SalaryComponentSettings = (await send("get", owner, "/salary-components")).body.data;
    const attendance = componentByName(settings, "Tunjangan Kehadiran");
    const archived = await send("post", owner, `/salary-components/${attendance.id}/archive`);
    expect(archived.status).toBe(200);
    expect(archived.body.data.components.at(-1)).toMatchObject({ name: "Tunjangan Kehadiran", archived: true });
    expect((await send("post", owner, "/salary-components", { name: "Premi Hadir", kind: "attendance_allowance" })).status).toBe(201);
    expect((await send("post", owner, `/salary-components/${attendance.id}/restore`)).status).toBe(409);

    const removed = await send("delete", owner, `/salary-components/${family.id}`);
    expect(removed.status).toBe(200);
    expect(removed.body.data.components.some((c: SalaryComponent) => c.id === family.id)).toBe(false);
    expect((await send("delete", owner, `/salary-components/${family.id}`)).status).toBe(404);
    expect((await send("delete", owner, "/salary-components/bukan-uuid")).status).toBe(404);

    const actions = await withTenant(db, { tenantId: ws.tenantId, userId: null }, (tx) =>
      tx.select({ action: auditLogs.action }).from(auditLogs).where(eq(auditLogs.entity, "salary_component")).orderBy(asc(auditLogs.createdAt)),
    );
    expect(actions.map((row) => row.action)).toEqual(["create", "update", "update", "archive", "create", "delete"]);
  });

  it("kelompok risiko JKK bisa diubah & divalidasi", async () => {
    const ws = await createWorkspace("Kopi JKK");
    const admin = await tokenOf(ws, "admin");
    const res = await send("put", admin, "/salary-components/jkk-risk-level", { jkkRiskLevel: 3 });
    expect(res.status).toBe(200);
    expect(res.body.data.jkkRiskLevel).toBe(3);
    expect((await send("put", admin, "/salary-components/jkk-risk-level", { jkkRiskLevel: 6 })).status).toBe(400);
    expect((await send("put", admin, "/salary-components/jkk-risk-level", { jkkRiskLevel: "2" })).status).toBe(400);
  });

  it("atasan & karyawan tidak bisa mengakses", async () => {
    const ws = await createWorkspace("Kopi Akses");
    const employeeId = await addEmployee(ws, "Dewi");
    for (const role of ["atasan", "karyawan"] as const) {
      const token = await tokenOf(ws, role);
      expect((await send("get", token, "/salary-components")).status).toBe(403);
      expect((await send("post", token, "/salary-components", { name: "X", kind: "deduction" })).status).toBe(403);
      expect((await send("get", token, `/employees/${employeeId}/salary`)).status).toBe(403);
    }
  });
});

describe("gaji karyawan berlaku-tanggal", () => {
  it("versi pertama boleh mundur ke tanggal masuk; versi baru menutup yang lama; isi tampil di detail", async () => {
    setNow();
    const ws = await createWorkspace("Kopi Gaji");
    const owner = await tokenOf(ws, "owner");
    const employeeId = await addEmployee(ws, "Dewi", "2026-09-15");
    const settings: SalaryComponentSettings = (await send("get", owner, "/salary-components")).body.data;
    const base = componentByName(settings, "Gaji Pokok");
    const position = componentByName(settings, "Tunjangan Jabatan");
    const meal = componentByName(settings, "Uang Makan");
    const loan = componentByName(settings, "Cicilan Pinjaman");

    const empty = await send("get", owner, `/employees/${employeeId}/salary`);
    expect(empty.status).toBe(200);
    expect(empty.body.data).toMatchObject({ today: "2026-10-09", joinDate: "2026-09-15", jkkRiskLevel: 1, versions: [] });
    expect(empty.body.data.components).toHaveLength(8);

    // Sebelum tanggal masuk / tanpa gaji pokok / komponen ganda → 400
    const valid = {
      effectiveFrom: "2026-09-15",
      items: [
        { componentId: loan.id, amount: "250000" },
        { componentId: base.id, amount: "4500000" },
        { componentId: position.id, amount: "500000" },
      ],
      bpjsPrograms: ["kesehatan", "jht", "jkk", "jkm"],
      note: "Gaji awal",
    };
    expect((await send("post", owner, `/employees/${employeeId}/salary`, { ...valid, effectiveFrom: "2026-09-14" })).status).toBe(400);
    expect((await send("post", owner, `/employees/${employeeId}/salary`, { ...valid, items: [{ componentId: meal.id, amount: "1" }] })).status).toBe(400);
    expect(
      (await send("post", owner, `/employees/${employeeId}/salary`, { ...valid, items: [...valid.items, { componentId: base.id, amount: "1" }] })).status,
    ).toBe(400);
    expect((await send("post", owner, `/employees/${employeeId}/salary`, { ...valid, items: [{ componentId: base.id, amount: "0" }] })).status).toBe(400);

    const first = await send("post", owner, `/employees/${employeeId}/salary`, valid);
    expect(first.status, JSON.stringify(first.body)).toBe(201);
    const afterFirst: EmployeeSalaryOverview = first.body.data;
    expect(afterFirst.versions).toHaveLength(1);
    expect(afterFirst.versions[0]).toMatchObject({
      effectiveFrom: "2026-09-15",
      effectiveTo: null,
      status: "active",
      // Urutan katalog, bukan urutan kiriman
      items: [
        { name: "Gaji Pokok", kind: "base_salary", amount: "4500000.00" },
        { name: "Tunjangan Jabatan", kind: "fixed_allowance", amount: "500000.00" },
        { name: "Cicilan Pinjaman", kind: "deduction", amount: "250000.00" },
      ],
      earningsTotal: "5000000.00",
      deductionsTotal: "250000.00",
      bpjsPrograms: ["kesehatan", "jht", "jkk", "jkm"],
      note: "Gaji awal",
      createdByName: "owner Kopi Gaji",
    });

    // Kenaikan mulai 1 Nov → versi lama ditutup 31 Okt
    const raise = await send("post", owner, `/employees/${employeeId}/salary`, {
      effectiveFrom: "2026-11-01",
      items: [
        { componentId: base.id, amount: "5000000" },
        { componentId: meal.id, amount: "300000.50" },
      ],
      bpjsPrograms: ["kesehatan", "jht", "jp", "jkk", "jkm"],
      note: "",
    });
    expect(raise.status).toBe(201);
    const afterRaise: EmployeeSalaryOverview = raise.body.data;
    expect(afterRaise.versions.map((v) => [v.effectiveFrom, v.effectiveTo, v.status])).toEqual([
      ["2026-11-01", null, "scheduled"],
      ["2026-09-15", "2026-10-31", "active"],
    ]);
    expect(afterRaise.versions[0]).toMatchObject({ earningsTotal: "5300000.50", deductionsTotal: "0.00", note: null });

    // Koreksi mundur 1 Okt → versi 1 Nov tergantikan (dihapus), versi awal ditutup 30 Sep
    const correction = await send("post", owner, `/employees/${employeeId}/salary`, {
      effectiveFrom: "2026-10-01",
      items: [{ componentId: base.id, amount: "4800000" }],
      bpjsPrograms: [],
      note: null,
    });
    expect(correction.status).toBe(201);
    const afterCorrection: EmployeeSalaryOverview = correction.body.data;
    expect(afterCorrection.versions.map((v) => [v.effectiveFrom, v.effectiveTo, v.status])).toEqual([
      ["2026-10-01", null, "active"],
      ["2026-09-15", "2026-09-30", "ended"],
    ]);
    expect(afterCorrection.versions[0]?.bpjsPrograms).toEqual([]);

    const actions = await withTenant(db, { tenantId: ws.tenantId, userId: null }, (tx) =>
      tx
        .select({ action: auditLogs.action })
        .from(auditLogs)
        .where(eq(auditLogs.entity, "employee_salary")),
    );
    // Satu transaksi = created_at sama → bandingkan isinya saja
    expect(actions.map((row) => row.action).sort()).toEqual(["close", "close", "create", "create", "create", "delete"]);

    // Komponen terpakai: hitungan karyawan, jenis terkunci, tidak bisa dihapus, tetap bisa diarsipkan
    const used: SalaryComponentSettings = (await send("get", owner, "/salary-components")).body.data;
    expect(componentByName(used, "Gaji Pokok")).toMatchObject({ inUse: true, employeeCount: 1 });
    // Tunjangan Jabatan hanya di versi yang sudah berakhir
    expect(componentByName(used, "Tunjangan Jabatan")).toMatchObject({ inUse: true, employeeCount: 0 });
    expect(componentByName(used, "Uang Makan")).toMatchObject({ inUse: false, employeeCount: 0 });
    expect((await send("put", owner, `/salary-components/${position.id}`, { name: "Tunjangan Jabatan", kind: "variable_allowance" })).status).toBe(409);
    expect((await send("put", owner, `/salary-components/${position.id}`, { name: "Tunj. Jabatan", kind: "fixed_allowance" })).status).toBe(200);
    expect((await send("delete", owner, `/salary-components/${position.id}`)).status).toBe(409);
    expect((await send("post", owner, `/salary-components/${position.id}/archive`)).status).toBe(200);

    // Komponen diarsipkan tidak bisa dipilih untuk versi baru, tapi riwayat tetap menampilkannya
    expect(
      (
        await send("post", owner, `/employees/${employeeId}/salary`, {
          effectiveFrom: "2026-12-01",
          items: [
            { componentId: base.id, amount: "4800000" },
            { componentId: position.id, amount: "1" },
          ],
          bpjsPrograms: [],
          note: null,
        })
      ).status,
    ).toBe(400);
    const history: EmployeeSalaryOverview = (await send("get", owner, `/employees/${employeeId}/salary`)).body.data;
    expect(history.components.some((c) => c.id === position.id)).toBe(false);
    expect(history.versions[1]?.items.map((item) => item.name)).toEqual(["Gaji Pokok", "Tunj. Jabatan", "Cicilan Pinjaman"]);
  });

  it("karyawan tidak dikenal / tanggal setelah keluar ditolak", async () => {
    setNow();
    const ws = await createWorkspace("Kopi Keluar");
    const owner = await tokenOf(ws, "owner");
    const employeeId = await addEmployee(ws, "Rina", "2026-01-01");
    await withTenant(db, { tenantId: ws.tenantId, userId: null }, (tx) => tx.update(employees).set({ endDate: "2026-09-30" }).where(eq(employees.id, employeeId)));
    const settings: SalaryComponentSettings = (await send("get", owner, "/salary-components")).body.data;
    const base = componentByName(settings, "Gaji Pokok");
    const body = { effectiveFrom: "2026-10-01", items: [{ componentId: base.id, amount: "3000000" }], bpjsPrograms: [], note: null };
    expect((await send("post", owner, `/employees/${employeeId}/salary`, body)).status).toBe(400);
    expect((await send("post", owner, `/employees/${employeeId}/salary`, { ...body, effectiveFrom: "2026-09-01" })).status).toBe(201);
    expect((await send("get", owner, `/employees/${randomUUID()}/salary`)).status).toBe(404);
  });
});

describe("database: gaji karyawan", () => {
  it("isi versi immutable, versi tidak beririsan, dan terisolasi per tenant", async () => {
    setNow();
    const a = await createWorkspace("Gaji A");
    const b = await createWorkspace("Gaji B");
    const ownerA = await tokenOf(a, "owner");
    const ownerB = await tokenOf(b, "owner");
    const employeeA = await addEmployee(a, "Dewi");
    const settingsA: SalaryComponentSettings = (await send("get", ownerA, "/salary-components")).body.data;
    const baseA = componentByName(settingsA, "Gaji Pokok");
    const saved = await send("post", ownerA, `/employees/${employeeA}/salary`, {
      effectiveFrom: "2026-10-01",
      items: [{ componentId: baseA.id, amount: "4000000" }],
      bpjsPrograms: ["kesehatan"],
      note: null,
    });
    expect(saved.status).toBe(201);
    const salaryId: string = saved.body.data.versions[0].id;
    const ctxA = { tenantId: a.tenantId, userId: null };

    // app_user hanya boleh UPDATE effective_to versi; item tidak bisa diubah sama sekali
    expect(await dbError(withTenant(db, ctxA, (tx) => tx.update(employeeSalaries).set({ bpjsJp: true }).where(eq(employeeSalaries.id, salaryId))))).toMatch(
      /permission denied/,
    );
    expect(
      await dbError(withTenant(db, ctxA, (tx) => tx.update(employeeSalaryItems).set({ amount: "1.00" }).where(eq(employeeSalaryItems.salaryId, salaryId)))),
    ).toMatch(/permission denied/);

    const overlap = await dbError(
      withTenant(db, ctxA, (tx) =>
        tx.insert(employeeSalaries).values({
          tenantId: a.tenantId,
          employeeId: employeeA,
          effectiveFrom: "2026-12-01",
          bpjsKesehatan: false,
          bpjsJht: false,
          bpjsJp: false,
          bpjsJkk: false,
          bpjsJkm: false,
        }),
      ),
    );
    expect(overlap).toMatch(/employee_salaries_no_overlap/);

    // Tenant B: tidak melihat baris A, tidak bisa membuka karyawan A, tidak bisa memakai komponen A
    const visible = await withTenant(db, { tenantId: b.tenantId, userId: null }, async (tx) => ({
      salaries: await tx.select({ id: employeeSalaries.id }).from(employeeSalaries),
      items: await tx.select({ id: employeeSalaryItems.id }).from(employeeSalaryItems),
      components: await tx.select({ tenantId: salaryComponents.tenantId }).from(salaryComponents),
    }));
    expect(visible.salaries).toEqual([]);
    expect(visible.items).toEqual([]);
    expect(new Set(visible.components.map((row) => row.tenantId))).toEqual(new Set([b.tenantId]));
    expect((await send("get", ownerB, `/employees/${employeeA}/salary`)).status).toBe(404);
    expect((await send("put", ownerB, `/salary-components/${baseA.id}`, { name: "Diretas", kind: "base_salary" })).status).toBe(404);

    const employeeB = await addEmployee(b, "Rina");
    const crossComponent = await send("post", ownerB, `/employees/${employeeB}/salary`, {
      effectiveFrom: "2026-10-01",
      items: [{ componentId: baseA.id, amount: "4000000" }],
      bpjsPrograms: [],
      note: null,
    });
    expect(crossComponent.status).toBe(400);
  });
});

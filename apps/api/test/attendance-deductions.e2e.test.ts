import "reflect-metadata";
import { randomUUID } from "node:crypto";

import * as schema from "@exapay/db";
import { attendanceDeductionRules, attendanceRecords, auditLogs, departments, employees, leaveRequests, memberships, positions, tenants, users } from "@exapay/db";
import type { AttendanceDeductionRules, MembershipRole } from "@exapay/shared";
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

// Verifikasi feature 17 (API): aturan potongan absensi berversi — ubah aturan → versi lama tetap tersimpan;
// isi versi tidak bisa diubah di database; pratinjau memakai rekap absensi nyata + payroll-engine.

const PASSWORD = "password-deduction-123";
const ROLES = ["owner", "admin", "atasan", "karyawan"] as const;

const PRORATE: AttendanceDeductionRules = {
  absence: { mode: "prorate", base: "base_salary", divisor: { mode: "actual" } },
  late: { mode: "per_occurrence", toleranceMinutes: 15, amountPerOccurrence: "25000", monthlyCap: null },
  permitSick: { mode: "without_document" },
  attendanceAllowance: { mode: "forfeit", minAbsentDays: 1 },
};
// Bentuk yang dibaca kembali dari database (numeric(18,2))
const PRORATE_STORED: AttendanceDeductionRules = {
  ...PRORATE,
  late: { mode: "per_occurrence", toleranceMinutes: 15, amountPerOccurrence: "25000.00", monthlyCap: null },
};
const FIXED: AttendanceDeductionRules = {
  absence: { mode: "fixed_per_day", amountPerDay: "100000" },
  late: { mode: "per_block", toleranceMinutes: 0, blockMinutes: 30, amountPerBlock: "10000", monthlyCap: "50000" },
  permitSick: { mode: "after_days", freeDays: 2 },
  attendanceAllowance: { mode: "reduce_per_day", amountPerDay: "50000" },
};
const NONE: AttendanceDeductionRules = {
  absence: { mode: "none" },
  late: { mode: "none" },
  permitSick: { mode: "none" },
  attendanceAllowance: { mode: "none" },
};

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

async function addEmployee(ws: Workspace, fullName: string): Promise<string> {
  const id = randomUUID();
  await withTenant(db, { tenantId: ws.tenantId, userId: null }, (tx) =>
    tx.insert(employees).values({
      id,
      tenantId: ws.tenantId,
      fullName,
      departmentId: ws.departmentId,
      positionId: ws.positionId,
      joinDate: "2025-01-01",
      employmentStatus: "permanent",
      ptkpStatus: "TK/0",
    }),
  );
  return id;
}

async function addRecord(ws: Workspace, employeeId: string, workDate: string, checkIn: string, late: number): Promise<void> {
  await withTenant(db, { tenantId: ws.tenantId, userId: null }, (tx) =>
    tx.insert(attendanceRecords).values({
      tenantId: ws.tenantId,
      employeeId,
      workDate,
      timeZone: "Asia/Jakarta",
      scheduledStart: "08:00",
      scheduledEnd: "17:00",
      lateMinutes: late,
      checkInAt: new Date(Date.parse(`${workDate}T${checkIn}:00+07:00`)),
      checkOutAt: new Date(Date.parse(`${workDate}T17:00:00+07:00`)),
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

function post(token: string, path: string, body: object): request.Test {
  return request(server).post(path).set("Authorization", `Bearer ${token}`).send(body);
}

// Drizzle membungkus error pg; cari pesan asli di rantai `cause`
async function dbError(promise: Promise<unknown>): Promise<string> {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  const messages: string[] = [];
  for (let current: unknown = error; current instanceof Error; current = current.cause) messages.push(current.message);
  return messages.join(" | ");
}

// Jumat 9 Okt 2026, 10:00 WIB
function setNow(): void {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-09T03:00:00Z"));
}

type Version = { id: string; effectiveFrom: string; effectiveTo: string | null; status: string; rules: AttendanceDeductionRules; createdByName: string | null };

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

describe("aturan potongan absensi berversi", () => {
  it("ubah aturan → versi lama tetap tersimpan; versi terjadwal yang tertimpa dihapus; semua tercatat di audit log", async () => {
    setNow();
    const ws = await createWorkspace("Kopi Potongan");
    const owner = await tokenOf(ws, "owner");
    const admin = await tokenOf(ws, "admin");

    const empty = await get(owner, "/attendance/deduction-rules");
    expect(empty.status).toBe(200);
    expect(empty.body.data).toEqual({ today: "2026-10-09", versions: [] });

    // v1 berlaku hari ini
    const first = await post(owner, "/attendance/deduction-rules", { effectiveFrom: "2026-10-09", rules: PRORATE });
    expect(first.status, JSON.stringify(first.body)).toBe(201);
    const [v1] = first.body.data.versions as Version[];
    expect(v1).toMatchObject({ effectiveFrom: "2026-10-09", effectiveTo: null, status: "active", rules: PRORATE_STORED, createdByName: "owner Kopi Potongan" });

    // v2 terjadwal 1 Nov → v1 ditutup 31 Okt, isinya tetap
    const second = await post(admin, "/attendance/deduction-rules", { effectiveFrom: "2026-11-01", rules: FIXED });
    expect(second.status).toBe(201);
    const afterSecond = second.body.data.versions as Version[];
    expect(afterSecond.map((v) => [v.effectiveFrom, v.effectiveTo, v.status])).toEqual([
      ["2026-11-01", null, "scheduled"],
      ["2026-10-09", "2026-10-31", "active"],
    ]);
    expect(afterSecond[1]?.rules).toEqual(PRORATE_STORED);
    // Nominal kembali dari numeric(18,2)
    expect(afterSecond[0]?.rules.absence).toEqual({ mode: "fixed_per_day", amountPerDay: "100000.00" });

    // v3 mulai 20 Okt → v2 (belum pernah berlaku) dihapus, v1 ditutup 19 Okt
    const third = await post(owner, "/attendance/deduction-rules", { effectiveFrom: "2026-10-20", rules: NONE });
    expect(third.status).toBe(201);
    const afterThird = third.body.data.versions as Version[];
    expect(afterThird.map((v) => [v.effectiveFrom, v.effectiveTo, v.status])).toEqual([
      ["2026-10-20", null, "scheduled"],
      ["2026-10-09", "2026-10-19", "active"],
    ]);
    expect(afterThird[1]?.id).toBe(v1?.id);
    expect(afterThird[1]?.rules).toEqual(PRORATE_STORED);

    const logs = await withTenant(db, { tenantId: ws.tenantId, userId: null }, (tx) =>
      tx
        .select({ action: auditLogs.action, entityId: auditLogs.entityId })
        .from(auditLogs)
        .where(eq(auditLogs.entity, "attendance_deduction_rule"))
        .orderBy(asc(auditLogs.createdAt)),
    );
    expect(logs.map((log) => log.action).sort()).toEqual(["close", "close", "create", "create", "create", "delete"]);
    expect(logs.filter((log) => log.action === "close").every((log) => log.entityId === v1?.id)).toBe(true);
  });

  it("tanggal berlaku lampau, aturan tidak konsisten, dan peran selain owner/admin ditolak", async () => {
    setNow();
    const ws = await createWorkspace("Kopi Validasi");
    const owner = await tokenOf(ws, "owner");

    const past = await post(owner, "/attendance/deduction-rules", { effectiveFrom: "2026-10-08", rules: PRORATE });
    expect(past.status).toBe(400);
    expect(past.body.error).toBe("Tanggal berlaku tidak boleh sebelum hari ini");

    const inconsistent = await post(owner, "/attendance/deduction-rules", {
      effectiveFrom: "2026-10-09",
      rules: { ...NONE, permitSick: { mode: "without_document" } },
    });
    expect(inconsistent.status).toBe(400);

    const badMoney = await post(owner, "/attendance/deduction-rules", {
      effectiveFrom: "2026-10-09",
      rules: { ...NONE, absence: { mode: "fixed_per_day", amountPerDay: "0" } },
    });
    expect(badMoney.status).toBe(400);

    for (const role of ["atasan", "karyawan"] as const) {
      const token = await tokenOf(ws, role);
      expect((await get(token, "/attendance/deduction-rules")).status).toBe(403);
      expect((await post(token, "/attendance/deduction-rules", { effectiveFrom: "2026-10-09", rules: NONE })).status).toBe(403);
    }
  });
});

describe("database: attendance_deduction_rules", () => {
  it("isi versi tidak bisa diubah, versi tidak boleh beririsan, dan terisolasi per tenant", async () => {
    setNow();
    const a = await createWorkspace("Kopi A");
    const b = await createWorkspace("Kopi B");
    const owner = await tokenOf(a, "owner");
    const saved = await post(owner, "/attendance/deduction-rules", { effectiveFrom: "2026-10-09", rules: FIXED });
    expect(saved.status).toBe(201);
    const versionId: string = saved.body.data.versions[0].id;
    const ctxA = { tenantId: a.tenantId, userId: null };

    // app_user hanya boleh UPDATE effective_to
    const update = await dbError(
      withTenant(db, ctxA, (tx) => tx.update(attendanceDeductionRules).set({ absenceAmountPerDay: "1.00" }).where(eq(attendanceDeductionRules.id, versionId))),
    );
    expect(update).toMatch(/permission denied/);

    // Rentang beririsan dengan versi yang terbuka (effective_to null)
    const overlap = await dbError(
      withTenant(db, ctxA, (tx) =>
        tx.insert(attendanceDeductionRules).values({
          tenantId: a.tenantId,
          effectiveFrom: "2026-12-01",
          absenceMode: "none",
          lateMode: "none",
          permitSickMode: "none",
          allowanceMode: "none",
        }),
      ),
    );
    expect(overlap).toMatch(/attendance_deduction_rules_no_overlap/);

    // Kolom tidak sesuai mode ditolak CHECK
    const inconsistent = await dbError(
      withTenant(db, { tenantId: b.tenantId, userId: null }, (tx) =>
        tx.insert(attendanceDeductionRules).values({
          tenantId: b.tenantId,
          effectiveFrom: "2026-10-09",
          absenceMode: "none",
          absenceAmountPerDay: "5000",
          lateMode: "none",
          permitSickMode: "none",
          allowanceMode: "none",
        }),
      ),
    );
    expect(inconsistent).toMatch(/attendance_deduction_rules_absence/);

    // Tenant B tidak melihat versi tenant A, dan tidak bisa menulis atas nama A
    const fromB = await withTenant(db, { tenantId: b.tenantId, userId: null }, (tx) => tx.select({ id: attendanceDeductionRules.id }).from(attendanceDeductionRules));
    expect(fromB).toEqual([]);
    const crossInsert = await dbError(
      withTenant(db, { tenantId: b.tenantId, userId: null }, (tx) =>
        tx.insert(attendanceDeductionRules).values({
          tenantId: a.tenantId,
          effectiveFrom: "2027-01-01",
          absenceMode: "none",
          lateMode: "none",
          permitSickMode: "none",
          allowanceMode: "none",
        }),
      ),
    );
    expect(crossInsert).toMatch(/row-level security/);
    const ownerB = await tokenOf(b, "owner");
    expect((await get(ownerB, "/attendance/deduction-rules")).body.data.versions).toEqual([]);
  });
});

describe("pratinjau potongan", () => {
  it("memakai rekap absensi nyata karyawan + gaji isian, dihitung payroll-engine", async () => {
    setNow();
    const ws = await createWorkspace("Kopi Pratinjau");
    const dewi = await addEmployee(ws, "Dewi Lestari");
    // Okt 2026: Sen 5 tepat waktu, Sel 6 telat 30, Rab 7 alpa, Kam 8 sakit disetujui tanpa lampiran, Jum 9 (hari ini) belum absen
    // Hari kerja 1–2 & 5–6 sebelumnya juga lampau tanpa absen → alpa: 1, 2, 7 = 3 hari
    await addRecord(ws, dewi, "2026-10-05", "07:55", 0);
    await addRecord(ws, dewi, "2026-10-06", "08:30", 30);
    await withTenant(db, { tenantId: ws.tenantId, userId: null }, (tx) =>
      tx.insert(leaveRequests).values({
        tenantId: ws.tenantId,
        employeeId: dewi,
        type: "sick",
        startDate: "2026-10-08",
        endDate: "2026-10-08",
        reason: "Demam",
        status: "approved",
        decidedAt: new Date(),
      }),
    );
    const owner = await tokenOf(ws, "owner");

    const res = await post(owner, "/attendance/deduction-rules/preview", {
      employeeId: dewi,
      month: "2026-10",
      baseSalary: "4400000",
      fixedAllowances: "0",
      attendanceAllowance: "300000",
      rules: PRORATE,
    });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const data = res.body.data;
    expect(data.employee).toEqual({ id: dewi, fullName: "Dewi Lestari", positionName: "Barista" });
    expect(data).toMatchObject({ from: "2026-10-01", to: "2026-10-31", today: "2026-10-09" });
    expect(data.facts).toEqual({
      periodWorkingDays: 22,
      employedWorkingDays: 22,
      absentDays: 3,
      lateMinutes: [30],
      permitDays: 0,
      sickDays: 1,
      undocumentedPermitSickDays: 1,
    });
    // 4.400.000 ÷ 22 = 200.000 per hari: alpa 3 → 600.000, sakit tanpa surat 1 → 200.000, telat 1 × 25.000
    expect(data.result.lines.map((line: { kind: string; amount: string }) => [line.kind, line.amount])).toEqual([
      ["absence", "600000.00"],
      ["permit_sick", "200000.00"],
      ["late", "25000.00"],
      ["attendance_allowance", "300000.00"],
    ]);
    expect(data.result.totalDeduction).toBe("825000.00");
    expect(data.result.attendanceAllowancePaid).toBe("0.00");

    // Pratinjau tidak menyimpan versi
    expect((await get(owner, "/attendance/deduction-rules")).body.data.versions).toEqual([]);

    const missing = await post(owner, "/attendance/deduction-rules/preview", {
      employeeId: randomUUID(),
      month: "2026-10",
      baseSalary: "4400000",
      fixedAllowances: "0",
      attendanceAllowance: "0",
      rules: PRORATE,
    });
    expect(missing.status).toBe(404);

    const karyawan = await tokenOf(ws, "karyawan");
    const denied = await post(karyawan, "/attendance/deduction-rules/preview", {
      employeeId: dewi,
      month: "2026-10",
      baseSalary: "4400000",
      fixedAllowances: "0",
      attendanceAllowance: "0",
      rules: PRORATE,
    });
    expect(denied.status).toBe(403);
  });
});

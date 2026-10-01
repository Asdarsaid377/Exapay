import "reflect-metadata";
import { randomUUID } from "node:crypto";

import * as schema from "@exapay/db";
import { attendanceRecords, departments, employees, leaveRequests, memberships, positions, taskLogs, tenants, users } from "@exapay/db";
import type {
  AttendanceRecap,
  ComplianceCalendar,
  EmployeeList,
  KpiScoreList,
  LeaveRequestList,
  MembershipRole,
  OwnerDashboard,
  PayrollRunDetail,
  SalaryComponentSettings,
  TaskVerificationList,
} from "@exapay/shared";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { hash } from "@node-rs/argon2";
import { Decimal } from "decimal.js";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, inject, it, vi } from "vitest";

import { AppModule } from "../src/app.module.js";
import { configureApp } from "../src/app.setup.js";
import { type Database, withTenant, withUser } from "../src/database/tenant-transaction.js";
import { seedTenantDefaults } from "../src/modules/tenants/tenant-defaults.js";

// Verifikasi feature 35 (API): angka dashboard owner/admin cocok dengan halaman sumbernya — rekap absensi, skor KPI,
// periode gaji, kepatuhan, karyawan aktif, tab Menunggu verifikasi tugas & pengajuan izin. Atasan ditolak (feature 36).

const PASSWORD = "password-dashboard-123";
const ROLES = ["owner", "admin", "atasan"] as const;

let app: INestApplication;
let server: Parameters<typeof request>[0];
let pool: pg.Pool;
let db: Database;

async function tokenOf(email: string): Promise<string> {
  const res = await request(server).post("/auth/login").send({ email, password: PASSWORD, client: "mobile" });
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body.data.tokens.accessToken;
}

function send(method: "get" | "post", token: string, path: string, body?: object): request.Test {
  const req = request(server)[method](path).set("Authorization", `Bearer ${token}`);
  return body ? req.send(body) : req;
}

async function getJson<T>(token: string, path: string): Promise<T> {
  const res = await send("get", token, path);
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body.data;
}

// Senin 5 Okt 2026 11:00 WITA (Kota Makassar). Ani tetap (gaji diatur), Budi kontrak, Citra percobaan, Dodi keluar 30 Sep.
// Absen 1–2 Okt + hari ini; Citra telat 2 Okt; Budi izin menunggu 6 Okt; satu catatan tugas menunggu.
async function createFixture(): Promise<{ emails: Record<(typeof ROLES)[number], string>; tenantId: string }> {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-05T03:00:00Z"));
  const tenantId = randomUUID();
  const passwordHash = await hash(PASSWORD);
  const emails = { owner: "", admin: "", atasan: "" };
  for (const role of ROLES) {
    const id = randomUUID();
    emails[role] = `${role}-${randomUUID().slice(0, 8)}@test.exapay.local`;
    await withUser(db, id, (tx) => tx.insert(users).values({ id, email: emails[role], fullName: `${role} Dashboard`, passwordHash, emailVerifiedAt: new Date() }));
    await withTenant(db, { tenantId, userId: id }, async (tx) => {
      if (role === "owner") {
        await tx.insert(tenants).values({ id: tenantId, name: "Kopi Dashboard", regencyCode: "73.71" });
        await seedTenantDefaults(tx, { tenantId, userId: id });
      }
      await tx.insert(memberships).values({ tenantId, userId: id, role: role satisfies MembershipRole });
    });
  }

  const ids = await withTenant(db, { tenantId, userId: null }, async (tx) => {
    const [department] = await tx.insert(departments).values({ tenantId, name: "Operasional" }).returning({ id: departments.id });
    const [position] = await tx.insert(positions).values({ tenantId, name: "Barista" }).returning({ id: positions.id });
    if (!department || !position) throw new Error("gagal membuat departemen/jabatan");
    const base = { tenantId, departmentId: department.id, positionId: position.id, joinDate: "2025-01-01", ptkpStatus: "TK/0" as const };
    const result = { ani: randomUUID(), budi: randomUUID(), citra: randomUUID(), dodi: randomUUID() };
    await tx.insert(employees).values([
      { ...base, id: result.ani, fullName: "Ani", employmentStatus: "permanent" },
      { ...base, id: result.budi, fullName: "Budi", employmentStatus: "contract", contractEndDate: "2026-10-20" },
      { ...base, id: result.citra, fullName: "Citra", employmentStatus: "probation", probationEndDate: "2026-10-30" },
      { ...base, id: result.dodi, fullName: "Dodi", employmentStatus: "permanent", endDate: "2026-09-30" },
    ]);
    const attend = (employeeId: string, workDate: string, lateMinutes = 0) =>
      tx.insert(attendanceRecords).values({
        tenantId,
        employeeId,
        workDate,
        timeZone: "Asia/Makassar",
        scheduledStart: "08:00",
        scheduledEnd: "17:00",
        lateMinutes,
        checkInAt: new Date(Date.parse(`${workDate}T08:00:00+08:00`) + lateMinutes * 60_000),
        checkInLatitude: -5.14,
        checkInLongitude: 119.42,
        checkOutAt: workDate < "2026-10-05" ? new Date(Date.parse(`${workDate}T17:00:00+08:00`)) : null,
      });
    for (const date of ["2026-10-01", "2026-10-02", "2026-10-05"]) await attend(result.ani, date);
    await attend(result.budi, "2026-10-01");
    await attend(result.citra, "2026-10-01");
    await attend(result.citra, "2026-10-02", 25);
    await tx.insert(leaveRequests).values({ tenantId, employeeId: result.budi, type: "sick", startDate: "2026-10-06", endDate: "2026-10-06", reason: "Demam" });
    await tx.insert(taskLogs).values({ tenantId, employeeId: result.ani, workDate: "2026-10-02", note: "Bersihkan mesin kopi" });
    return result;
  });

  const admin = await tokenOf(emails.admin);
  const settings = await getJson<SalaryComponentSettings>(admin, "/salary-components");
  const basePay = settings.components.find((item) => item.name === "Gaji Pokok")?.id;
  const salary = await send("post", admin, `/employees/${ids.ani}/salary`, {
    effectiveFrom: "2025-01-01",
    items: [{ componentId: basePay, amount: "4500000" }],
    bpjsPrograms: ["kesehatan"],
    note: null,
  });
  expect(salary.status, JSON.stringify(salary.body)).toBe(201);
  return { emails, tenantId };
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

describe("dashboard owner/admin", () => {
  it("angka cocok dengan halaman sumbernya; atasan ditolak", async () => {
    const f = await createFixture();
    const owner = await tokenOf(f.emails.owner);

    // Belum ada periode gaji
    const before = await getJson<OwnerDashboard>(owner, "/dashboard");
    expect(before.payroll).toBeNull();
    expect(before.pending.payrollDrafts).toEqual([]);

    const opened = await send("post", owner, "/payroll/runs", { month: "2026-10" });
    expect(opened.status, JSON.stringify(opened.body)).toBe(201);
    const dashboard = await getJson<OwnerDashboard>(owner, "/dashboard");
    expect(dashboard.today).toBe("2026-10-05");

    // Karyawan aktif = tab Aktif /employees
    const employeeList = await getJson<EmployeeList>(owner, "/employees");
    expect(dashboard.employees).toEqual({ active: employeeList.counts.active, permanent: 1, contract: 1, probation: 1 });

    // Rekap absensi periode berjalan = /attendance/recap
    const recap = await getJson<AttendanceRecap>(owner, "/attendance/recap");
    const sum = (pick: (summary: AttendanceRecap["rows"][number]["summary"]) => number) => recap.rows.reduce((total, row) => total + pick(row.summary), 0);
    expect(dashboard.attendance).toMatchObject({ month: recap.month, from: recap.from, to: recap.to, employeeCount: recap.rows.length });
    expect(dashboard.attendance.totals).toEqual({
      present: sum((s) => s.present),
      late: sum((s) => s.late),
      leave: sum((s) => s.permit + s.sick + s.leave),
      absent: sum((s) => s.absent),
    });
    expect(dashboard.attendance.totals).toEqual({ present: 6, late: 1, leave: 0, absent: 1 });
    expect(dashboard.attendance.days).toHaveLength(31);
    const day = (date: string) => dashboard.attendance.days.find((item) => item.date === date);
    expect(day("2026-10-02")).toEqual({ date: "2026-10-02", expected: 3, onTime: 1, late: 1, leave: 0, absent: 1, pending: 0 });
    // Hari ini: Ani sudah absen, Budi & Citra belum
    expect(day("2026-10-05")).toEqual({ date: "2026-10-05", expected: 3, onTime: 1, late: 0, leave: 0, absent: 0, pending: 2 });

    // Skor KPI bulan berjalan = /kpi/scores
    const scores = await getJson<KpiScoreList>(owner, "/kpi/scores");
    expect(dashboard.kpi).toEqual({
      from: scores.from,
      to: scores.to,
      scoredCount: Object.values(scores.predicateCounts).reduce((total, n) => total + n, 0),
      averageScore: scores.averageScore,
      averagePredicate: scores.averagePredicate,
      predicateCounts: scores.predicateCounts,
    });

    // Biaya gaji = bruto + BPJS perusahaan periode terbaru (/payroll/runs/:id)
    const run = await getJson<PayrollRunDetail>(owner, `/payroll/runs/${opened.body.data.id}`);
    expect(dashboard.payroll?.run).toMatchObject({ id: run.id, month: "2026-10", status: "draft", payDate: run.payDate });
    expect(dashboard.payroll).toMatchObject({ employeeCount: run.totals.employeeCount, grossPay: run.totals.grossPay, bpjsEmployer: run.totals.bpjsEmployer });
    expect(dashboard.payroll?.cost).toBe(new Decimal(run.totals.grossPay).plus(run.totals.bpjsEmployer).toFixed(2));
    expect(new Decimal(dashboard.payroll?.cost ?? "0").greaterThan(0)).toBe(true);
    expect(dashboard.pending.payrollDrafts.map((draft) => draft.id)).toEqual([run.id]);

    // Tindakan tertunda = tab Menunggu
    const tasks = await getJson<TaskVerificationList>(owner, "/tasks/verification?status=pending");
    expect(dashboard.pending.taskLogs).toEqual({ count: tasks.pendingCount, oldestWorkDate: "2026-10-02" });
    const leaves = await getJson<LeaveRequestList>(owner, "/attendance/leave-requests?status=pending");
    expect(dashboard.pending.leaveRequests).toEqual({ count: leaves.pendingCount, permit: 0, sick: 1, leave: 0 });
    expect(dashboard.pending.kpiReviews).toEqual({ count: 0 });

    // Pengingat = kalender kepatuhan (terlewat sama; berikutnya terdekat dulu, belum selesai)
    const calendar = await getJson<ComplianceCalendar>(owner, "/compliance");
    expect(dashboard.compliance.overdue).toBe(calendar.overdue.length);
    expect(dashboard.compliance.reminders.length).toBeLessThanOrEqual(4);
    const dueDates = dashboard.compliance.reminders.map((reminder) => reminder.dueDate);
    expect(dueDates).toEqual([...dueDates].sort());
    for (const reminder of dashboard.compliance.reminders) {
      const same = [...calendar.overdue, ...calendar.reminders].find((item) => item.key === reminder.key);
      if (same) expect(reminder).toEqual(same);
    }
    expect(dashboard.minimumWage).toEqual(calendar.minimumWage);

    // Atasan: dashboard owner/admin ditolak
    const atasan = await tokenOf(f.emails.atasan);
    expect((await send("get", atasan, "/dashboard")).status).toBe(403);
  });
});

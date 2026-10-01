import "reflect-metadata";
import { randomUUID } from "node:crypto";

import * as schema from "@exapay/db";
import {
  attendanceDeductionRules,
  attendanceRecords,
  auditLogs,
  departments,
  employees,
  memberships,
  payrollAdjustments,
  payrollRunEmployees,
  payrollRuns,
  positions,
  tenants,
  users,
} from "@exapay/db";
import type {
  MembershipRole,
  PayrollEmployeeDetail,
  PayrollRunDetail,
  PayrollRunList,
  PayrollRunRow,
  PtkpStatus,
  SalaryComponentSettings,
} from "@exapay/shared";
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

// Verifikasi feature 29 (API): buka periode payroll (bulan kalender), draf dihitung payroll-engine dari gaji berlaku +
// absensi + aturan potongan + regulasi, penyesuaian admin (tambah baris, ganti nominal, batalkan potongan absensi,
// keluarkan karyawan). Angka draf dicocokkan dengan hitungan manual 3 karyawan contoh (Oktober 2026, Kota Makassar).
// Feature 30: finalisasi → snapshot immutable (angka sama dengan draf, tidak dihitung ulang), syarat final, sidik draf,
// kunci database, gaji berlaku-mundur ditolak, masa PPh 21 sebelumnya dari snapshot final.

const PASSWORD = "password-payroll-123";
const ROLES = ["owner", "admin", "atasan", "karyawan"] as const;

let app: INestApplication;
let server: Parameters<typeof request>[0];
let pool: pg.Pool;
let db: Database;

type Workspace = {
  tenantId: string;
  emails: Record<MembershipRole, string>;
  departmentId: string;
  positionId: string;
};

async function createWorkspace(name: string): Promise<Workspace> {
  const tenantId = randomUUID();
  const passwordHash = await hash(PASSWORD);
  const emails: Record<MembershipRole, string> = { owner: "", admin: "", atasan: "", karyawan: "" };
  for (const role of ROLES) {
    const id = randomUUID();
    emails[role] = `${role}-${randomUUID().slice(0, 8)}@test.exapay.local`;
    await withUser(db, id, (tx) => tx.insert(users).values({ id, email: emails[role], fullName: `${role} ${name}`, passwordHash, emailVerifiedAt: new Date() }));
    await withTenant(db, { tenantId, userId: id }, async (tx) => {
      if (role === "owner") {
        // Kota Makassar → UMP Sulawesi Selatan 2026 Rp3.921.088 (UMK belum ada di data)
        await tx.insert(tenants).values({ id: tenantId, name, regencyCode: "73.71", payday: 25 });
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
  return { tenantId, emails, ...ids };
}

async function addEmployee(ws: Workspace, fullName: string, joinDate: string, ptkpStatus: PtkpStatus, endDate: string | null = null): Promise<string> {
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
      ptkpStatus,
      endDate,
      endReason: endDate ? "Mengundurkan diri" : null,
    }),
  );
  return id;
}

// Hari kerja Oktober 2026 (Senin–Jumat, tanpa libur nasional) mulai tanggal `from`
function octoberWorkdays(from = 1): string[] {
  const dates: string[] = [];
  for (let day = from; day <= 31; day += 1) {
    const date = `2026-10-${String(day).padStart(2, "0")}`;
    const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
    if (weekday !== 0 && weekday !== 6) dates.push(date);
  }
  return dates;
}

async function attend(ws: Workspace, employeeId: string, dates: readonly string[]): Promise<void> {
  await withTenant(db, { tenantId: ws.tenantId, userId: null }, (tx) =>
    tx.insert(attendanceRecords).values(
      dates.map((workDate) => ({
        tenantId: ws.tenantId,
        employeeId,
        workDate,
        timeZone: "Asia/Makassar",
        scheduledStart: "08:00",
        scheduledEnd: "17:00",
        lateMinutes: 0,
        checkInAt: new Date(Date.parse(`${workDate}T07:55:00+08:00`)),
        checkOutAt: new Date(Date.parse(`${workDate}T17:00:00+08:00`)),
      })),
    ),
  );
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

// Kamis 5 Nov 2026, 11:00 WITA — periode Oktober sudah berakhir
function setNow(iso = "2026-11-05T03:00:00Z"): void {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(iso));
}

type Fixture = {
  ws: Workspace;
  admin: string;
  componentId: (name: string) => string;
  andi: string;
  budi: string;
  citra: string;
  dodi: string;
};

// 3 karyawan contoh + 1 tanpa gaji. Aturan potongan: alpa Rp100.000/hari, tunjangan kehadiran hangus bila alpa ≥ 1 hari.
async function createFixture(name: string): Promise<Fixture> {
  setNow();
  const ws = await createWorkspace(name);
  const admin = await tokenOf(ws, "admin");
  const settings: SalaryComponentSettings = (await send("get", admin, "/salary-components")).body.data;
  const componentId = (componentName: string): string => {
    const found = settings.components.find((component) => component.name === componentName);
    if (!found) throw new Error(`komponen ${componentName} tidak ada`);
    return found.id;
  };

  await withTenant(db, { tenantId: ws.tenantId, userId: null }, (tx) =>
    tx.insert(attendanceDeductionRules).values({
      tenantId: ws.tenantId,
      effectiveFrom: "2026-10-01",
      absenceMode: "fixed_per_day",
      absenceAmountPerDay: "100000",
      lateMode: "none",
      permitSickMode: "none",
      allowanceMode: "forfeit",
      allowanceMinAbsentDays: 1,
    }),
  );

  const andi = await addEmployee(ws, "Andi Saputra", "2025-01-01", "TK/0");
  const budi = await addEmployee(ws, "Budi Santoso", "2026-10-15", "K/1");
  const citra = await addEmployee(ws, "Citra Lestari", "2025-01-01", "TK/0");
  const dodi = await addEmployee(ws, "Dodi Pratama", "2025-01-01", "TK/0");

  const salary = async (employeeId: string, effectiveFrom: string, items: [string, string][], bpjsPrograms: string[]): Promise<void> => {
    const res = await send("post", admin, `/employees/${employeeId}/salary`, {
      effectiveFrom,
      items: items.map(([componentName, amount]) => ({ componentId: componentId(componentName), amount })),
      bpjsPrograms,
      note: null,
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
  };
  await salary(
    andi,
    "2025-01-01",
    [
      ["Gaji Pokok", "5000000"],
      ["Tunjangan Jabatan", "1000000"],
      ["Uang Makan", "500000"],
    ],
    ["kesehatan", "jht", "jp", "jkk", "jkm"],
  );
  await salary(budi, "2026-10-15", [["Gaji Pokok", "4000000"]], ["kesehatan", "jht", "jkk", "jkm"]);
  await salary(
    citra,
    "2025-01-01",
    [
      ["Gaji Pokok", "3500000"],
      ["Tunjangan Kehadiran", "300000"],
    ],
    ["kesehatan"],
  );

  await attend(ws, andi, octoberWorkdays());
  await attend(ws, budi, octoberWorkdays(15));
  // Citra alpa 2 hari (Senin 12 & Selasa 13 Okt)
  await attend(
    ws,
    citra,
    octoberWorkdays().filter((date) => date !== "2026-10-12" && date !== "2026-10-13"),
  );
  await attend(ws, dodi, octoberWorkdays());
  return { ws, admin, componentId, andi, budi, citra, dodi };
}

async function openOctober(f: Fixture): Promise<string> {
  const res = await send("post", f.admin, "/payroll/runs", { month: "2026-10" });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body.data.id;
}

async function runDetail(f: Fixture, runId: string): Promise<PayrollRunDetail> {
  const res = await send("get", f.admin, `/payroll/runs/${runId}`);
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body.data;
}

async function employeeDetail(f: Fixture, runId: string, employeeId: string): Promise<PayrollEmployeeDetail> {
  const res = await send("get", f.admin, `/payroll/runs/${runId}/employees/${employeeId}`);
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body.data;
}

function rowOf(detail: PayrollRunDetail, employeeId: string): PayrollRunRow {
  const row = detail.rows.find((candidate) => candidate.employee.id === employeeId);
  if (!row) throw new Error(`baris ${employeeId} tidak ada`);
  return row;
}

async function adjust(f: Fixture, runId: string, employeeId: string, body: object): Promise<request.Response> {
  return send("post", f.admin, `/payroll/runs/${runId}/employees/${employeeId}/adjustments`, body);
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

describe("buka periode", () => {
  it("daftar menawarkan bulan berjalan s.d. 12 bulan ke belakang; periode ganda / bulan depan ditolak", async () => {
    const f = await createFixture("Kopi Periode");
    const list: PayrollRunList = (await send("get", f.admin, "/payroll/runs")).body.data;
    expect(list.today).toBe("2026-11-05");
    expect(list.openableMonths[0]).toBe("2026-11");
    expect(list.openableMonths).toHaveLength(13);
    expect(list.openableMonths.at(-1)).toBe("2025-11");

    const runId = await openOctober(f);
    const after: PayrollRunList = (await send("get", f.admin, "/payroll/runs")).body.data;
    expect(after.openableMonths).not.toContain("2026-10");
    expect(after.runs).toEqual([
      expect.objectContaining({ id: runId, month: "2026-10", periodStart: "2026-10-01", periodEnd: "2026-10-31", payDate: "2026-10-25", status: "draft", adjustmentCount: 0 }),
    ]);

    expect((await send("post", f.admin, "/payroll/runs", { month: "2026-10" })).status).toBe(409);
    expect((await send("post", f.admin, "/payroll/runs", { month: "2026-12" })).status).toBe(400);
    expect((await send("post", f.admin, "/payroll/runs", { month: "2025-10" })).status).toBe(400);

    const audit = await withTenant(db, { tenantId: f.ws.tenantId, userId: null }, (tx) =>
      tx.select({ action: auditLogs.action }).from(auditLogs).where(eq(auditLogs.entity, "payroll_run")),
    );
    expect(audit).toEqual([{ action: "create" }]);
  });

  it("hanya owner/admin; periode usaha lain tidak terlihat", async () => {
    const f = await createFixture("Kopi Akses");
    const runId = await openOctober(f);
    expect((await send("get", await tokenOf(f.ws, "atasan"), "/payroll/runs")).status).toBe(403);
    expect((await send("get", await tokenOf(f.ws, "karyawan"), `/payroll/runs/${runId}`)).status).toBe(403);
    expect((await send("get", await tokenOf(f.ws, "owner"), `/payroll/runs/${runId}`)).status).toBe(200);

    const other = await createWorkspace("Kopi Lain");
    const otherAdmin = await tokenOf(other, "admin");
    expect((await send("get", otherAdmin, `/payroll/runs/${runId}`)).status).toBe(404);
    expect((await send("get", otherAdmin, "/payroll/runs")).body.data.runs).toEqual([]);
    // RLS: konteks usaha lain tidak melihat baris periode maupun penyesuaian
    const rows = await withTenant(db, { tenantId: other.tenantId, userId: null }, async (tx) => ({
      runs: await tx.select({ id: payrollRuns.id }).from(payrollRuns),
      adjustments: await tx.select({ id: payrollAdjustments.id }).from(payrollAdjustments),
    }));
    expect(rows).toEqual({ runs: [], adjustments: [] });
  });
});

describe("draf cocok dengan hitungan manual", () => {
  it("3 karyawan contoh + karyawan tanpa gaji", async () => {
    const f = await createFixture("Kopi Draf");
    const runId = await openOctober(f);
    // Andi: THR & kasbon periode ini
    expect((await adjust(f, runId, f.andi, { kind: "add_line", lineKind: "variable_allowance", name: "THR", amount: "1000000" })).status).toBe(200);
    expect((await adjust(f, runId, f.andi, { kind: "add_line", lineKind: "deduction", name: "Kasbon", amount: "200000" })).status).toBe(200);

    const detail = await runDetail(f, runId);
    expect(detail.periodEnded).toBe(true);
    expect(detail).toMatchObject({ periodStart: "2026-10-01", periodEnd: "2026-10-31", payDate: "2026-10-25" });
    // Gajian 25 tanpa tutup buku (akhir bulan) → peringatan (feature 30b)
    expect(detail.warnings).toEqual([
      "Tanggal gajian (25 Oktober 2026) jatuh sebelum absensi ditutup (31 Oktober 2026) — payroll belum bisa difinalisasi di hari gajian. Atur tanggal tutup buku di Profil usaha.",
    ]);
    expect(detail.rows.map((row) => row.employee.fullName)).toEqual(["Andi Saputra", "Budi Santoso", "Citra Lestari", "Dodi Pratama"]);

    // Andi (TK/0, sebulan penuh, 5 program BPJS). Upah BPJS = 5 jt + 1 jt = 6 jt.
    // Pendapatan 5.000.000 + 1.000.000 + 500.000 + THR 1.000.000 = 7.500.000 (tanpa potongan absensi)
    // BPJS karyawan: Kesehatan 1% 60.000 + JHT 2% 120.000 + JP 1% 60.000 = 240.000; potongan = 240.000 + kasbon 200.000
    // Bruto PPh = 7.500.000 + Kesehatan 4% 240.000 + JKK 0,24% 14.400 + JKM 0,3% 18.000 = 7.772.400 → TER A 1,5% = 116.586
    // Diterima = 7.500.000 − 440.000 − 116.586 = 6.943.414
    expect(rowOf(detail, f.andi)).toMatchObject({
      status: "calculated",
      grossPay: "7500000.00",
      totalDeductions: "440000.00",
      pph21: "116586.00",
      takeHomePay: "6943414.00",
      adjustmentCount: 2,
      warningCount: 0,
    });

    // Budi (K/1, masuk Kamis 15 Okt, tanpa JP): 12 dari 22 hari kerja → gaji pokok 4.000.000 × 12 ÷ 22 = 2.181.818
    // Upah BPJS tetap 4 jt sebulan penuh: karyawan Kesehatan 40.000 + JHT 80.000 = 120.000
    // Bruto PPh = 2.181.818 + 160.000 + 9.600 + 12.000 = 2.363.418 → TER B 0%. Diterima = 2.181.818 − 120.000
    expect(rowOf(detail, f.budi)).toMatchObject({
      status: "calculated",
      grossPay: "2181818.00",
      totalDeductions: "120000.00",
      pph21: "0.00",
      takeHomePay: "2061818.00",
    });

    // Citra (TK/0, hanya BPJS Kesehatan): alpa 2 hari × 100.000; tunjangan kehadiran 300.000 hangus
    // Bruto = 3.500.000 − 200.000 = 3.300.000. Upah 3,5 jt < UMP 3.921.088 → iuran Kesehatan dari UMP:
    // karyawan 1% = 39.210,88 → 39.211; perusahaan 4% = 156.843,52 → 156.844. Bruto PPh 3.456.844 → TER A 0%
    expect(rowOf(detail, f.citra)).toMatchObject({
      status: "calculated",
      grossPay: "3300000.00",
      totalDeductions: "39211.00",
      pph21: "0.00",
      takeHomePay: "3260789.00",
    });

    expect(rowOf(detail, f.dodi)).toMatchObject({ status: "no_salary", grossPay: null, takeHomePay: null });

    expect(detail.totals).toEqual({
      employeeCount: 3,
      grossPay: "12981818.00",
      // 614.400 + 329.600 + 156.844
      bpjsEmployer: "1100844.00",
      bpjsEmployee: "399211.00",
      pph21: "116586.00",
      takeHomePay: "12266021.00",
    });

    // Rincian per karyawan dengan penjelasan
    const citra = await employeeDetail(f, runId, f.citra);
    expect(citra.attendanceFacts).toMatchObject({ periodWorkingDays: 22, employedWorkingDays: 22, absentDays: 2 });
    expect(citra.result?.attendance?.lines.map((line) => [line.kind, line.amount])).toEqual([
      ["absence", "200000.00"],
      ["attendance_allowance", "300000.00"],
    ]);
    expect(citra.result?.bpjs[0]?.steps.join(" ")).toMatch(/upah minimum/);
    expect(citra.pph21?.method).toBe("ter");

    const budi = await employeeDetail(f, runId, f.budi);
    expect(budi.result?.proration).toMatchObject({ periodWorkingDays: 22, employedWorkingDays: 12 });
    expect(budi.employee.ptkpStatus).toBe("K/1");
    expect(budi.pph21?.terKind).toBe("ter_b");
  });
});

describe("penyesuaian", () => {
  it("ganti nominal komponen, batalkan potongan absensi, keluarkan karyawan — lalu dibatalkan", async () => {
    const f = await createFixture("Kopi Sesuai");
    const runId = await openOctober(f);
    const uangMakan = f.componentId("Uang Makan");

    // Uang makan Andi bulan ini 300.000 (bukan 500.000) → bruto 5.000.000 + 1.000.000 + 300.000
    expect((await adjust(f, runId, f.andi, { kind: "override_component", componentId: uangMakan, amount: "300000", reason: "Cuti 8 hari" })).status).toBe(200);
    // Simpan lagi = isi diganti (tetap satu baris)
    expect((await adjust(f, runId, f.andi, { kind: "override_component", componentId: uangMakan, amount: "350000", reason: "Koreksi" })).status).toBe(200);
    let andi = await employeeDetail(f, runId, f.andi);
    expect(andi.adjustments).toHaveLength(1);
    expect(andi.adjustments[0]).toMatchObject({ kind: "override_component", componentName: "Uang Makan", amount: "350000.00", reason: "Koreksi" });
    expect(andi.result?.grossPay).toBe("6350000.00");
    expect(andi.salary?.items.find((item) => item.componentId === uangMakan)?.amount).toBe("500000.00");

    // Ubah lewat PUT; komponen tidak boleh diganti
    const overrideId = andi.adjustments[0]?.id ?? "";
    expect(
      (await send("put", f.admin, `/payroll/runs/${runId}/adjustments/${overrideId}`, { kind: "override_component", componentId: uangMakan, amount: "0", reason: "Tidak dibayar" }))
        .status,
    ).toBe(200);
    andi = await employeeDetail(f, runId, f.andi);
    expect(andi.result?.grossPay).toBe("6000000.00");
    expect(
      (
        await send("put", f.admin, `/payroll/runs/${runId}/adjustments/${overrideId}`, {
          kind: "override_component",
          componentId: f.componentId("Gaji Pokok"),
          amount: "1",
          reason: "x",
        })
      ).status,
    ).toBe(400);
    expect((await send("put", f.admin, `/payroll/runs/${runId}/adjustments/${overrideId}`, { kind: "exclude", reason: "x" })).status).toBe(400);

    // Validasi: komponen tidak ada di gaji karyawan, gaji pokok 0, alasan wajib
    expect((await adjust(f, runId, f.budi, { kind: "override_component", componentId: uangMakan, amount: "1", reason: "x" })).status).toBe(400);
    expect((await adjust(f, runId, f.andi, { kind: "override_component", componentId: f.componentId("Gaji Pokok"), amount: "0", reason: "x" })).status).toBe(400);
    expect((await adjust(f, runId, f.andi, { kind: "exclude", reason: "  " })).status).toBe(400);

    // Batalkan potongan absensi Citra → tidak ada potongan alpa, tunjangan kehadiran dibayar penuh
    expect((await adjust(f, runId, f.citra, { kind: "waive_attendance", reason: "Alpa karena banjir, disetujui owner" })).status).toBe(200);
    let citra = await employeeDetail(f, runId, f.citra);
    expect(citra.attendanceWaived).toBe(true);
    expect(citra.result?.grossPay).toBe("3800000.00");
    expect(citra.result?.attendanceDeductionTotal).toBe("0.00");

    // Keluarkan Budi → tidak dihitung, tidak masuk total
    expect((await adjust(f, runId, f.budi, { kind: "exclude", reason: "Dibayar terpisah" })).status).toBe(200);
    let detail = await runDetail(f, runId);
    expect(rowOf(detail, f.budi)).toMatchObject({ status: "excluded", message: "Dibayar terpisah", takeHomePay: null });
    expect(detail.totals.employeeCount).toBe(2);

    // Hapus semua penyesuaian → kembali ke angka awal
    for (const employeeId of [f.andi, f.budi, f.citra]) {
      for (const adjustment of (await employeeDetail(f, runId, employeeId)).adjustments) {
        expect((await send("delete", f.admin, `/payroll/runs/${runId}/adjustments/${adjustment.id}`)).status).toBe(200);
      }
    }
    detail = await runDetail(f, runId);
    expect(detail.totals.employeeCount).toBe(3);
    citra = await employeeDetail(f, runId, f.citra);
    expect(citra.result?.grossPay).toBe("3300000.00");

    const audit = await withTenant(db, { tenantId: f.ws.tenantId, userId: null }, (tx) =>
      tx.select({ action: auditLogs.action }).from(auditLogs).where(eq(auditLogs.entity, "payroll_adjustment")),
    );
    expect(audit.map((entry) => entry.action).sort()).toEqual(["create", "create", "create", "delete", "delete", "delete", "update", "update"]);
  });

  it("karyawan di luar periode → 404; penyesuaian periode lain tidak bisa diubah lewat periode ini", async () => {
    const f = await createFixture("Kopi Luar");
    const runId = await openOctober(f);
    const later = await addEmployee(f.ws, "Eka Baru", "2026-11-02", "TK/0");
    expect((await send("get", f.admin, `/payroll/runs/${runId}/employees/${later}`)).status).toBe(404);
    expect((await adjust(f, runId, later, { kind: "exclude", reason: "x" })).status).toBe(404);

    const september = (await send("post", f.admin, "/payroll/runs", { month: "2026-09" })).body.data.id;
    expect((await adjust(f, runId, f.andi, { kind: "exclude", reason: "x" })).status).toBe(200);
    const adjustmentId = (await employeeDetail(f, runId, f.andi)).adjustments[0]?.id ?? "";
    expect((await send("delete", f.admin, `/payroll/runs/${september}/adjustments/${adjustmentId}`)).status).toBe(404);
  });

  it("isi penyesuaian dijaga CHECK database", async () => {
    const f = await createFixture("Kopi Check");
    const runId = await openOctober(f);
    const insert = (values: Partial<typeof payrollAdjustments.$inferInsert>) =>
      withTenant(db, { tenantId: f.ws.tenantId, userId: null }, (tx) =>
        tx.insert(payrollAdjustments).values({ tenantId: f.ws.tenantId, runId, employeeId: f.andi, kind: "exclude", ...values }),
      ).then(
        () => "ok",
        (error: unknown) => (error instanceof Error && error.cause instanceof Error ? error.cause.message : String(error)),
      );
    expect(await insert({ kind: "exclude" })).toMatch(/payroll_adjustments_fields/);
    expect(await insert({ kind: "add_line", lineKind: "base_salary", name: "x", amount: "1" })).toMatch(/payroll_adjustments_fields/);
    expect(await insert({ kind: "add_line", lineKind: "deduction", name: "x", amount: "0" })).toMatch(/payroll_adjustments_fields/);
    expect(await insert({ kind: "exclude", reason: "a" })).toBe("ok");
    expect(await insert({ kind: "exclude", reason: "b" })).toMatch(/payroll_adjustments_single_key/);
  });
});

describe("periode berjalan", () => {
  it("periode belum berakhir → peringatan; karyawan keluar di tengah bulan diprorata", async () => {
    const f = await createFixture("Kopi Berjalan");
    const leaver = await addEmployee(f.ws, "Fajar Keluar", "2025-01-01", "TK/0", "2026-10-16");
    const res = await send("post", f.admin, `/employees/${leaver}/salary`, {
      effectiveFrom: "2025-01-01",
      items: [{ componentId: f.componentId("Gaji Pokok"), amount: "4400000" }],
      bpjsPrograms: [],
      note: null,
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    await attend(f.ws, leaver, octoberWorkdays().filter((date) => date <= "2026-10-16"));

    // Selasa 20 Okt 2026
    setNow("2026-10-20T03:00:00Z");
    const admin = await tokenOf(f.ws, "admin");
    const runId = (await send("post", admin, "/payroll/runs", { month: "2026-10" })).body.data.id;
    const detail: PayrollRunDetail = (await send("get", admin, `/payroll/runs/${runId}`)).body.data;
    expect(detail.periodEnded).toBe(false);
    expect(detail.warnings.join(" ")).toMatch(/Periode belum berakhir/);

    // Keluar Jumat 16 Okt: 12 dari 22 hari kerja → 4.400.000 × 12 ÷ 22 = 2.400.000; masa pajak terakhir (berhenti)
    const fajar: PayrollEmployeeDetail = (await send("get", admin, `/payroll/runs/${runId}/employees/${leaver}`)).body.data;
    expect(fajar.result?.grossPay).toBe("2400000.00");
    expect(fajar.pph21?.method).toBe("annual");
  });
});

// Pesan error Postgres dari operasi langsung sebagai app_user
function dbError(work: Promise<unknown>): Promise<string> {
  return work.then(
    () => "ok",
    (error: unknown) => (error instanceof Error && error.cause instanceof Error ? error.cause.message : String(error)),
  );
}

async function finalize(f: Fixture, runId: string, fingerprint?: string): Promise<request.Response> {
  return send("post", f.admin, `/payroll/runs/${runId}/finalize`, { fingerprint: fingerprint ?? (await runDetail(f, runId)).finalization?.fingerprint });
}

describe("finalisasi", () => {
  it("syarat final: periode berakhir, semua karyawan terhitung, periode sebelumnya final", async () => {
    const f = await createFixture("Kopi Syarat");
    const runId = await openOctober(f);
    const september = (await send("post", f.admin, "/payroll/runs", { month: "2026-09" })).body.data.id;

    let detail = await runDetail(f, runId);
    expect(detail.finalization?.blockers).toEqual([
      "Payroll September 2026 masih draf — finalisasi periode sebelumnya lebih dulu.",
      "1 karyawan belum bisa dihitung — atur gajinya atau keluarkan dari periode ini.",
    ]);
    let res = await finalize(f, runId);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/September 2026 masih draf/);

    // Periode belum berakhir
    setNow("2026-10-20T03:00:00Z");
    const admin = await tokenOf(f.ws, "admin");
    const running: PayrollRunDetail = (await send("get", admin, `/payroll/runs/${runId}`)).body.data;
    expect(running.finalization?.blockers[0]).toBe("Periode baru bisa difinalisasi setelah absensi ditutup (mulai 1 November 2026).");
    vi.useRealTimers();
    setNow();

    // September: semua karyawan dikeluarkan → tidak ada yang dihitung
    detail = await runDetail(f, september);
    for (const row of detail.rows) {
      expect((await adjust(f, september, row.employee.id, { kind: "exclude", reason: "Belum pakai Exapay" })).status).toBe(200);
    }
    expect((await runDetail(f, september)).finalization?.blockers).toEqual(["Belum ada karyawan yang dihitung di periode ini."]);
    expect((await finalize(f, september)).status).toBe(400);
  });

  it("snapshot = angka draf; final terkunci di API & database; koreksi lewat periode berikutnya", async () => {
    const f = await createFixture("Kopi Final");
    const runId = await openOctober(f);
    expect((await adjust(f, runId, f.andi, { kind: "add_line", lineKind: "variable_allowance", name: "THR", amount: "1000000" })).status).toBe(200);
    expect((await adjust(f, runId, f.dodi, { kind: "exclude", reason: "Gaji belum disepakati" })).status).toBe(200);
    const draft = await runDetail(f, runId);
    const draftAndi = await employeeDetail(f, runId, f.andi);
    expect(draft.finalization?.blockers).toEqual([]);

    // Sidik basi (draf berubah setelah dibuka) → 409; sidik tidak valid → 400
    expect((await adjust(f, runId, f.andi, { kind: "add_line", lineKind: "deduction", name: "Kasbon", amount: "200000" })).status).toBe(200);
    expect((await finalize(f, runId, draft.finalization?.fingerprint)).status).toBe(409);
    expect((await finalize(f, runId, "abc")).status).toBe(400);
    const kasbon = (await employeeDetail(f, runId, f.andi)).adjustments.find((adjustment) => adjustment.name === "Kasbon");
    expect((await send("delete", f.admin, `/payroll/runs/${runId}/adjustments/${kasbon?.id}`)).status).toBe(200);

    // Hanya owner/admin
    const atasan = await tokenOf(f.ws, "atasan");
    expect((await send("post", atasan, `/payroll/runs/${runId}/finalize`, { fingerprint: draft.finalization?.fingerprint })).status).toBe(403);

    const res = await finalize(f, runId, draft.finalization?.fingerprint);
    expect(res.status, JSON.stringify(res.body)).toBe(200);

    const final = await runDetail(f, runId);
    expect(final).toMatchObject({ status: "final", finalization: null, totals: draft.totals, rows: draft.rows, warnings: draft.warnings });
    expect(final.finalizedByName).toBe("admin Kopi Final");
    expect(final.finalizedAt).not.toBeNull();
    const finalAndi = await employeeDetail(f, runId, f.andi);
    expect({ ...finalAndi, run: null }).toEqual({ ...draftAndi, run: null });
    expect(finalAndi.run.status).toBe("final");
    expect((await employeeDetail(f, runId, f.dodi)).status).toBe("excluded");

    // Final kedua kali, penyesuaian → 409
    expect((await finalize(f, runId, draft.finalization?.fingerprint)).status).toBe(409);
    expect((await adjust(f, runId, f.citra, { kind: "exclude", reason: "x" })).status).toBe(409);
    const thr = finalAndi.adjustments[0]?.id ?? "";
    expect((await send("delete", f.admin, `/payroll/runs/${runId}/adjustments/${thr}`)).status).toBe(409);

    // Data sumber berubah setelah final → angka final tetap (tidak dihitung ulang)
    await withTenant(db, { tenantId: f.ws.tenantId, userId: null }, (tx) =>
      tx.update(attendanceRecords).set({ lateMinutes: 30 }).where(eq(attendanceRecords.employeeId, f.citra)),
    );
    await withTenant(db, { tenantId: f.ws.tenantId, userId: null }, (tx) =>
      tx.update(attendanceDeductionRules).set({ effectiveTo: "2026-10-31" }).where(eq(attendanceDeductionRules.tenantId, f.ws.tenantId)),
    );
    expect((await runDetail(f, runId)).totals).toEqual(draft.totals);

    // Gaji berlaku-mundur ke periode final ditolak; mulai November boleh
    const salary = (effectiveFrom: string) =>
      send("post", f.admin, `/employees/${f.citra}/salary`, {
        effectiveFrom,
        items: [{ componentId: f.componentId("Gaji Pokok"), amount: "3600000" }],
        bpjsPrograms: ["kesehatan"],
        note: null,
      });
    const backdated = await salary("2026-10-31");
    expect(backdated.status).toBe(400);
    expect(backdated.body.error).toBe(
      "Payroll Oktober 2026 sudah final — tanggal berlaku harus setelah 31 Oktober 2026. Koreksi gaji periode final lewat penyesuaian periode berikutnya.",
    );
    expect((await salary("2026-11-01")).status).toBe(201);

    // Bulan sebelum periode final tidak bisa dibuka lagi
    const list: PayrollRunList = (await send("get", f.admin, "/payroll/runs")).body.data;
    expect(list.openableMonths).toEqual(["2026-11"]);
    expect((await send("post", f.admin, "/payroll/runs", { month: "2026-09" })).status).toBe(400);

    // Database menolak perubahan langsung sebagai app_user
    const tenantTx = <T>(work: Parameters<typeof withTenant<T>>[2]) => withTenant(db, { tenantId: f.ws.tenantId, userId: null }, work);
    expect(await dbError(tenantTx((tx) => tx.update(payrollRuns).set({ status: "draft" }).where(eq(payrollRuns.id, runId))))).toMatch(/payroll final terkunci/);
    expect(await dbError(tenantTx((tx) => tx.update(payrollRunEmployees).set({ fullName: "x" }).where(eq(payrollRunEmployees.runId, runId))))).toMatch(
      /permission denied/,
    );
    expect(await dbError(tenantTx((tx) => tx.delete(payrollRunEmployees).where(eq(payrollRunEmployees.runId, runId))))).toMatch(/permission denied/);
    expect(
      await dbError(tenantTx((tx) => tx.insert(payrollAdjustments).values({ tenantId: f.ws.tenantId, runId, employeeId: f.citra, kind: "exclude", reason: "x" }))),
    ).toMatch(/penyesuaian payroll final terkunci/);
    expect(await dbError(tenantTx((tx) => tx.delete(payrollAdjustments).where(eq(payrollAdjustments.runId, runId))))).toMatch(/penyesuaian payroll final terkunci/);

    const audit = await tenantTx((tx) => tx.select({ action: auditLogs.action, after: auditLogs.after }).from(auditLogs).where(eq(auditLogs.entityId, runId)));
    expect(audit.map((entry) => entry.action).sort()).toEqual(["create", "finalize"]);
    expect(audit.find((entry) => entry.action === "finalize")?.after).toMatchObject({ status: "final", month: "2026-10", totals: draft.totals, excluded: [f.dodi] });
  });

  it("masa pajak Desember memakai PPh 21 masa sebelumnya dari snapshot final", async () => {
    // Usaha tanpa aturan potongan & lokasi; karyawan masuk 1 Nov 2026, gaji pokok 10 jt tanpa BPJS
    setNow("2027-01-05T03:00:00Z");
    const ws = await createWorkspace("Kopi Pajak");
    const admin = await tokenOf(ws, "admin");
    const f: Fixture = { ws, admin, componentId: () => "", andi: "", budi: "", citra: "", dodi: "" };
    const settings: SalaryComponentSettings = (await send("get", admin, "/salary-components")).body.data;
    const baseSalary = settings.components.find((component) => component.kind === "base_salary")?.id;
    const employeeId = await addEmployee(ws, "Gita Pajak", "2026-11-01", "TK/0");
    const saved = await send("post", admin, `/employees/${employeeId}/salary`, {
      effectiveFrom: "2026-11-01",
      items: [{ componentId: baseSalary, amount: "10000000" }],
      bpjsPrograms: [],
      note: null,
    });
    expect(saved.status, JSON.stringify(saved.body)).toBe(201);
    const november = (await send("post", admin, "/payroll/runs", { month: "2026-11" })).body.data.id;
    const december = (await send("post", admin, "/payroll/runs", { month: "2026-12" })).body.data.id;

    // Desember tanpa November final: belum ada masa sebelumnya → urutan final ditegakkan
    expect((await runDetail(f, december)).finalization?.blockers).toEqual(["Payroll November 2026 masih draf — finalisasi periode sebelumnya lebih dulu."]);
    expect((await employeeDetail(f, december, employeeId)).pph21?.annual?.withheldThisEmployer).toBe("0.00");

    // November: TER A 2% × 10.000.000 = 200.000
    expect((await employeeDetail(f, november, employeeId)).pph21?.pph21).toBe("200000.00");
    expect((await finalize(f, november)).status).toBe(200);

    // Desember: bruto setahun 20 jt − biaya jabatan 1 jt = 19 jt < PTKP 54 jt → pajak setahun 0; 200.000 dikembalikan
    const gita = await employeeDetail(f, december, employeeId);
    expect(gita.pph21?.method).toBe("annual");
    expect(gita.pph21?.annual).toMatchObject({ grossIncome: "20000000.00", withheldThisEmployer: "200000.00", annualTax: "0.00" });
    expect(gita.pph21?.pph21).toBe("-200000.00");
    expect((await finalize(f, december)).status).toBe(200);
  });
});

// Feature 30b: tanggal tutup buku absensi per usaha
describe("tutup buku absensi", () => {
  async function setCutoff(f: Fixture, attendanceCutoffDay: number | null): Promise<void> {
    const owner = await tokenOf(f.ws, "owner");
    const res = await send("put", owner, "/company", { name: "Kopi Tutup Buku", address: null, npwp: null, regencyCode: "73.71", payday: 28, attendanceCutoffDay });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
  }

  it("tutup buku 25 & gajian 28: rentang 26 Sep – 25 Okt, final tanggal 26, periode berikutnya & peralihan", async () => {
    const f = await createFixture("Kopi Tutup Buku");
    await setCutoff(f, 25);
    // Andi juga hadir 28–30 Sep; Citra tidak (alpa 3 hari di rentang ini + 2 hari Oktober)
    await attend(f.ws, f.andi, ["2026-09-28", "2026-09-29", "2026-09-30"]);

    // Senin 26 Okt 2026, 11:00 WITA — absensi Oktober sudah ditutup
    setNow("2026-10-26T03:00:00Z");
    f.admin = await tokenOf(f.ws, "admin");
    const list: PayrollRunList = (await send("get", f.admin, "/payroll/runs")).body.data;
    expect(list.openableMonths[0]).toBe("2026-11");
    const runId = await openOctober(f);

    const draft = await runDetail(f, runId);
    // Gajian 28 setelah tutup buku → tanpa peringatan gajian. Aturan potongan fixture baru berlaku 1 Okt (di tengah periode)
    expect(draft).toMatchObject({ periodStart: "2026-09-26", periodEnd: "2026-10-25", payDate: "2026-10-28", periodEnded: true });
    expect(draft.warnings).toEqual([
      "Aturan potongan absensi berubah mulai 1 Oktober 2026 — periode ini memakai aturan yang berlaku di hari pertama periode; aturan baru dipakai mulai periode berikutnya.",
    ]);

    // Hari kerja 26 Sep – 25 Okt: 28–30 Sep (3) + 1–23 Okt (17) = 20
    const andi = await employeeDetail(f, runId, f.andi);
    expect(andi.attendanceFacts).toMatchObject({ periodWorkingDays: 20, employedWorkingDays: 20, absentDays: 0 });
    expect(andi.employee).toMatchObject({ joinDate: "2025-01-01", endDate: null });
    const citra = await employeeDetail(f, runId, f.citra);
    expect(citra.attendanceFacts?.absentDays).toBe(5);
    // Budi masuk 15 Okt: 15–16 & 19–23 Okt = 7 dari 20 hari kerja → 4.000.000 × 7 ÷ 20 = 1.400.000
    const budi = await employeeDetail(f, runId, f.budi);
    expect(budi.result?.proration).toMatchObject({ periodWorkingDays: 20, employedWorkingDays: 7 });
    expect(budi.result?.grossPay).toBe("1400000.00");
    // Label Masuk di daftar
    expect(rowOf(draft, f.budi).employee).toMatchObject({ joinDate: "2026-10-15", endDate: null });

    // Rekap absensi bulan Oktober = rentang tutup buku; pratinjau bulan berjalan = November
    const recap = (await send("get", f.admin, "/attendance/recap?month=2026-10")).body.data;
    expect(recap).toMatchObject({ from: "2026-09-26", to: "2026-10-25", month: "2026-10", currentMonth: "2026-11", cutoffDay: 25 });

    expect((await adjust(f, runId, f.dodi, { kind: "exclude", reason: "Gaji belum disepakati" })).status).toBe(200);
    expect((await runDetail(f, runId)).finalization?.blockers).toEqual([]);
    expect((await finalize(f, runId)).status).toBe(200);
    const stored = await withTenant(db, { tenantId: f.ws.tenantId, userId: null }, (tx) =>
      tx.select({ periodStart: payrollRuns.periodStart, periodEnd: payrollRuns.periodEnd }).from(payrollRuns).where(eq(payrollRuns.id, runId)),
    );
    expect(stored).toEqual([{ periodStart: "2026-09-26", periodEnd: "2026-10-25" }]);

    // Gaji berlaku-mundur dibatasi akhir rentang final (25 Okt), bukan akhir bulan
    const salary = (effectiveFrom: string) =>
      send("post", f.admin, `/employees/${f.citra}/salary`, {
        effectiveFrom,
        items: [{ componentId: f.componentId("Gaji Pokok"), amount: "3600000" }],
        bpjsPrograms: ["kesehatan"],
        note: null,
      });
    expect((await salary("2026-10-25")).body.error).toMatch(/harus setelah 25 Oktober 2026/);
    expect((await salary("2026-10-26")).status).toBe(201);

    // November dimulai sehari setelah periode final; tutup buku diubah ke akhir bulan → peralihan 26 Okt – 30 Nov
    const november = (await send("post", f.admin, "/payroll/runs", { month: "2026-11" })).body.data.id;
    expect(await runDetail(f, november)).toMatchObject({ periodStart: "2026-10-26", periodEnd: "2026-11-25" });
    await setCutoff(f, null);
    const transition = await runDetail(f, november);
    expect(transition).toMatchObject({ periodStart: "2026-10-26", periodEnd: "2026-11-30" });
    expect(transition.warnings.join(" ")).toMatch(/Periode peralihan 26 Oktober 2026 – 30 November 2026/);
    expect(transition.warnings.join(" ")).toMatch(/Tanggal gajian \(28 November 2026\) jatuh sebelum absensi ditutup/);
    // Periode final tetap memakai rentang tersimpan
    expect(await runDetail(f, runId)).toMatchObject({ periodStart: "2026-09-26", periodEnd: "2026-10-25" });
  });
});

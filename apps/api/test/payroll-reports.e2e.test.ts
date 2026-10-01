import "reflect-metadata";
import { randomUUID } from "node:crypto";

import * as schema from "@exapay/db";
import { attendanceRecords, auditLogs, departments, employees, memberships, positions, tenants, users } from "@exapay/db";
import { type MembershipRole, type PayrollReport, type PayrollRunDetail, type PayslipRun, type SalaryComponentSettings } from "@exapay/shared";
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
import { FieldCipher } from "../src/common/crypto/field-cipher.js";
import { seedTenantDefaults } from "../src/modules/tenants/tenant-defaults.js";
import readXlsxFile from "read-excel-file/node";

// Verifikasi feature 32 (API): rekap tahunan periode final = jumlah slip; Excel transfer bank (semua + per bank + tanpa
// rekening, nomor rekening teks utuh, audit) & rekap setor (BPJS per program, PPh 21) cocok dengan rekap; akses & syarat final.
// Fixture sama dengan feature 31 (Eka: rekening BCA dengan nol di depan; Fajar: tanpa rekening; Gita dikeluarkan).

const PASSWORD = "password-payslip-123";
const ROLES = ["owner", "admin", "atasan", "karyawan"] as const;

let app: INestApplication;
let server: Parameters<typeof request>[0];
let pool: pg.Pool;
let db: Database;
let cipher: FieldCipher;

type Fixture = {
  tenantId: string;
  userIds: Record<MembershipRole, string>;
  emails: Record<MembershipRole, string>;
  admin: string;
  // Tertaut ke akun karyawan
  eka: string;
  // Tanpa akun portal
  fajar: string;
  // Dikeluarkan dari periode
  gita: string;
  runId: string;
};

async function tokenOf(email: string): Promise<string> {
  const res = await request(server).post("/auth/login").send({ email, password: PASSWORD, client: "mobile" });
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body.data.tokens.accessToken;
}

function send(method: "get" | "post", token: string, path: string, body?: object): request.Test {
  const req = request(server)[method](path).set("Authorization", `Bearer ${token}`);
  return body ? req.send(body) : req;
}

function octoberWorkdays(): string[] {
  const dates: string[] = [];
  for (let day = 1; day <= 31; day += 1) {
    const date = `2026-10-${String(day).padStart(2, "0")}`;
    const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
    if (weekday !== 0 && weekday !== 6) dates.push(date);
  }
  return dates;
}

// Usaha + 3 karyawan bergaji, periode Oktober 2026 final (Gita dikeluarkan). Kamis 5 Nov 2026 — periode sudah berakhir.
async function createFixture(name: string): Promise<Fixture> {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-05T03:00:00Z"));
  const tenantId = randomUUID();
  const passwordHash = await hash(PASSWORD);
  const emails: Record<MembershipRole, string> = { owner: "", admin: "", atasan: "", karyawan: "" };
  const userIds: Record<MembershipRole, string> = { owner: "", admin: "", atasan: "", karyawan: "" };
  for (const role of ROLES) {
    const id = randomUUID();
    userIds[role] = id;
    emails[role] = `${role}-${randomUUID().slice(0, 8)}@test.exapay.local`;
    await withUser(db, id, (tx) => tx.insert(users).values({ id, email: emails[role], fullName: `${role} ${name}`, passwordHash, emailVerifiedAt: new Date() }));
    await withTenant(db, { tenantId, userId: id }, async (tx) => {
      if (role === "owner") {
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
    const employee = async (fullName: string, userId: string | null): Promise<string> => {
      const id = randomUUID();
      await tx.insert(employees).values({
        id,
        tenantId,
        fullName,
        userId,
        departmentId: department.id,
        positionId: position.id,
        joinDate: "2025-01-01",
        employmentStatus: "permanent",
        ptkpStatus: "TK/0",
      });
      await tx.insert(attendanceRecords).values(
        octoberWorkdays().map((workDate) => ({
          tenantId,
          employeeId: id,
          workDate,
          timeZone: "Asia/Makassar",
          scheduledStart: "08:00",
          scheduledEnd: "17:00",
          lateMinutes: 0,
          checkInAt: new Date(Date.parse(`${workDate}T07:55:00+08:00`)),
          checkOutAt: new Date(Date.parse(`${workDate}T17:00:00+08:00`)),
        })),
      );
      return id;
    };
    const result = { eka: await employee("Eka Putri", userIds.karyawan), fajar: await employee("Fajar Nugroho", null), gita: await employee("Gita Ayu", null) };
    await tx
      .update(employees)
      .set({ bankCode: "BCA", bankAccountEncrypted: cipher.encrypt("0123456789", { tenantId, field: "employees.bank_account" }), bankAccountHolder: "EKA PUTRI" })
      .where(eq(employees.id, result.eka));
    return result;
  });

  const admin = await tokenOf(emails.admin);
  const settings: SalaryComponentSettings = (await send("get", admin, "/salary-components")).body.data;
  const baseSalary = settings.components.find((component) => component.name === "Gaji Pokok");
  if (!baseSalary) throw new Error("komponen gaji pokok tidak ada");
  for (const employeeId of [ids.eka, ids.fajar, ids.gita]) {
    const res = await send("post", admin, `/employees/${employeeId}/salary`, {
      effectiveFrom: "2025-01-01",
      items: [{ componentId: baseSalary.id, amount: "4500000" }],
      bpjsPrograms: ["kesehatan"],
      note: null,
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
  }

  const runId: string = (await send("post", admin, "/payroll/runs", { month: "2026-10" })).body.data.id;
  expect((await send("post", admin, `/payroll/runs/${runId}/employees/${ids.gita}/adjustments`, { kind: "exclude", reason: "Dibayar terpisah" })).status).toBe(200);
  const draft: PayrollRunDetail = (await send("get", admin, `/payroll/runs/${runId}`)).body.data;
  const res = await send("post", admin, `/payroll/runs/${runId}/finalize`, { fingerprint: draft.finalization?.fingerprint });
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return { tenantId, userIds, emails, admin, ...ids, runId };
}

async function getJson<T>(token: string, path: string, status = 200): Promise<T> {
  const res = await send("get", token, path);
  expect(res.status, JSON.stringify(res.body)).toBe(status);
  return res.body.data;
}

async function download(token: string, path: string): Promise<request.Response> {
  return send("get", token, path)
    .buffer(true)
    .parse((res, done) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => done(null, Buffer.concat(chunks)));
    });
}

type Sheets = { sheet: string; data: unknown[][] }[];

function sheetOf(sheets: Sheets, name: string): unknown[][] {
  const found = sheets.find((sheet) => sheet.sheet === name);
  if (!found) throw new Error(`sheet ${name} tidak ada`);
  return found.data;
}

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: inject("testDatabaseUrl") });
  db = drizzle({ client: pool, schema });
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();
  server = app.getHttpServer();
  cipher = app.get(FieldCipher);
});

afterEach(() => {
  vi.useRealTimers();
});

afterAll(async () => {
  await app?.close();
  await pool?.end();
});

describe("laporan & ekspor payroll", () => {
  it("rekap tahunan = jumlah slip; Excel transfer bank & rekap setor cocok", async () => {
    const f = await createFixture("Kopi Laporan");

    // ——— Rekap tahun 2026: satu periode final, total = jumlah gaji diterima di slip
    const report = await getJson<PayrollReport>(f.admin, "/payroll/reports?year=2026");
    expect(report.years).toEqual([2026]);
    expect(report.months.map((month) => [month.month, month.runId, month.totals.employeeCount])).toEqual([["2026-10", f.runId, 2]]);
    const slips = await getJson<PayslipRun>(f.admin, `/payroll/runs/${f.runId}/slips`);
    const slipTotal = slips.rows.reduce((total, row) => total + Number(row.takeHomePay), 0);
    expect(Number(report.totals.takeHomePay)).toBe(slipTotal);
    expect(report.totals.employeeCount).toBe(slips.rows.length);
    // Sama dengan total snapshot periode
    const run = await getJson<PayrollRunDetail>(f.admin, `/payroll/runs/${f.runId}`);
    expect(report.months[0]?.totals).toEqual(run.totals);
    expect(report.totals).toEqual(run.totals);

    // Tahun tanpa periode final; tanpa ?year = tahun berjalan (5 Nov 2026)
    const empty = await getJson<PayrollReport>(f.admin, "/payroll/reports?year=2025");
    expect(empty).toMatchObject({ year: 2025, years: [2026, 2025], months: [], totals: { employeeCount: 0, takeHomePay: "0.00" } });
    expect((await getJson<PayrollReport>(f.admin, "/payroll/reports")).year).toBe(2026);
    expect((await send("get", f.admin, "/payroll/reports?year=abc")).status).toBe(400);

    // ——— Excel transfer bank
    const transfer = await download(f.admin, `/payroll/reports/runs/${f.runId}/transfer`);
    expect(transfer.status).toBe(200);
    expect(transfer.headers["content-disposition"]).toBe('attachment; filename="transfer-gaji-2026-10.xlsx"');
    const transferSheets = (await readXlsxFile(transfer.body as Buffer)) as unknown as Sheets;
    expect(transferSheets.map((sheet) => sheet.sheet)).toEqual(["Semua", "BCA", "Tanpa rekening"]);
    const all = sheetOf(transferSheets, "Semua");
    expect(all[0]).toEqual(["No", "Nama", "No. karyawan", "Bank", "No. rekening", "Atas nama", "Nominal", "Keterangan"]);
    const eka = slips.rows.find((row) => row.employee.id === f.eka);
    const fajar = slips.rows.find((row) => row.employee.id === f.fajar);
    expect(all[1]).toEqual([1, "Eka Putri", null, "Bank Central Asia", "0123456789", "EKA PUTRI", Number(eka?.takeHomePay), null]);
    expect(all[2]).toEqual([2, "Fajar Nugroho", null, null, null, null, Number(fajar?.takeHomePay), "Rekening belum diisi"]);
    expect(all[3]?.[1]).toBe("Total 2 karyawan");
    expect(all[3]?.[6]).toBe(slipTotal);
    expect(sheetOf(transferSheets, "BCA").slice(1, -1).map((row) => row[1])).toEqual(["Eka Putri"]);
    expect(sheetOf(transferSheets, "Tanpa rekening").slice(1, -1).map((row) => row[1])).toEqual(["Fajar Nugroho"]);
    const audit = await withTenant(db, { tenantId: f.tenantId, userId: null }, (tx) =>
      tx.select({ action: auditLogs.action, after: auditLogs.after }).from(auditLogs).where(eq(auditLogs.action, "export_transfer")),
    );
    expect(audit).toEqual([{ action: "export_transfer", after: { rows: 2 } }]);

    // ——— Excel rekap setor: total BPJS & PPh 21 = rekap
    const contributions = await download(f.admin, `/payroll/reports/runs/${f.runId}/contributions`);
    expect(contributions.status).toBe(200);
    const contributionSheets = (await readXlsxFile(contributions.body as Buffer)) as unknown as Sheets;
    expect(contributionSheets.map((sheet) => sheet.sheet)).toEqual(["Ringkasan setor", "BPJS", "PPh 21"]);
    const bpjs = sheetOf(contributionSheets, "BPJS");
    const bpjsTotal = bpjs[bpjs.length - 1] ?? [];
    expect(bpjsTotal.slice(-2)).toEqual([Number(report.totals.bpjsEmployer), Number(report.totals.bpjsEmployee)]);
    const pph21 = sheetOf(contributionSheets, "PPh 21");
    expect(pph21[pph21.length - 1]?.at(-1)).toBe(Number(report.totals.pph21));
    const summary = sheetOf(contributionSheets, "Ringkasan setor");
    expect(summary[0]?.[0]).toBe("Rekap setor — Kopi Laporan");
    expect(summary.find((row) => row[0] === "Total BPJS Kesehatan")?.slice(1)).toEqual([
      Number(report.totals.bpjsEmployer),
      Number(report.totals.bpjsEmployee),
      Number(report.totals.bpjsEmployer) + Number(report.totals.bpjsEmployee),
    ]);

    // ——— Akses & syarat
    const atasan = await tokenOf(f.emails.atasan);
    expect((await send("get", atasan, "/payroll/reports")).status).toBe(403);
    expect((await send("get", atasan, `/payroll/reports/runs/${f.runId}/transfer`)).status).toBe(403);
    vi.setSystemTime(new Date("2026-11-05T03:00:00Z"));
    const draftId: string = (await send("post", f.admin, "/payroll/runs", { month: "2026-11" })).body.data.id;
    const draft = await send("get", f.admin, `/payroll/reports/runs/${draftId}/contributions`);
    expect(draft.status).toBe(409);
    expect(draft.body.error).toBe("Laporan & ekspor tersedia setelah payroll periode ini final");
  });
});

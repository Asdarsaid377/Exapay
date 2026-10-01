import "reflect-metadata";
import { randomUUID } from "node:crypto";

import * as schema from "@exapay/db";
import { attendanceRecords, auditLogs, departments, employees, memberships, payslips, positions, tenants, users } from "@exapay/db";
import { type MembershipRole, PAYSLIP_EMAIL_JOB, PAYSLIP_GENERATE_JOB, type PayrollRunDetail, type PayslipRun, type SalaryComponentSettings } from "@exapay/shared";
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
import { FileStorage, tenantFileKey } from "../src/modules/storage/file-storage.js";
import { seedTenantDefaults } from "../src/modules/tenants/tenant-defaults.js";
import { PAYSLIP_QUEUE, type PayslipQueue } from "../src/redis/redis.module.js";

// Verifikasi feature 31 (API): finalisasi membuat baris slip (pending) untuk karyawan yang dihitung + job antrean
// "payslips"; halaman slip owner/admin (status, akun portal), unduh PDF sebelum terbit, terbitkan (+ email antre untuk
// karyawan berakun), kirim ulang email, proses ulang slip gagal; portal karyawan hanya melihat slip sendiri yang terbit;
// kunci database (slip siap/terbit tidak bisa diubah, slip hanya untuk karyawan dihitung). Hasil worker ditiru di DB —
// pembuatan PDF diuji di apps/worker, ujung-ke-ujung diverifikasi manual.

const PASSWORD = "password-payslip-123";
const ROLES = ["owner", "admin", "atasan", "karyawan"] as const;
const PDF = Buffer.from("%PDF-1.7\n% slip contoh\n%%EOF\n");

let app: INestApplication;
let server: Parameters<typeof request>[0];
let pool: pg.Pool;
let db: Database;
let queue: PayslipQueue;
let storage: FileStorage;

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
    return { eka: await employee("Eka Putri", userIds.karyawan), fajar: await employee("Fajar Nugroho", null), gita: await employee("Gita Ayu", null) };
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

async function slips(f: Fixture): Promise<PayslipRun> {
  const res = await send("get", f.admin, `/payroll/runs/${f.runId}/slips`);
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body.data;
}

function slipOf(run: PayslipRun, employeeId: string): PayslipRun["rows"][number] {
  const row = run.rows.find((candidate) => candidate.employee.id === employeeId);
  if (!row) throw new Error(`slip ${employeeId} tidak ada`);
  return row;
}

// Tiru hasil worker: PDF tersimpan + status ready / failed
async function markReady(f: Fixture, payslipId: string): Promise<void> {
  const key = tenantFileKey(f.tenantId, "payslips", f.runId, `${payslipId}.pdf`);
  await storage.put(key, PDF, "application/pdf");
  await withTenant(db, { tenantId: f.tenantId, userId: null }, (tx) =>
    tx.update(payslips).set({ status: "ready", fileKey: key, fileSize: PDF.length, generatedAt: new Date(), attempts: 1 }).where(eq(payslips.id, payslipId)),
  );
}

async function markFailed(f: Fixture, payslipId: string): Promise<void> {
  await withTenant(db, { tenantId: f.tenantId, userId: null }, (tx) =>
    tx.update(payslips).set({ status: "failed", error: "Slip gagal dibuat. Coba proses ulang.", attempts: 3 }).where(eq(payslips.id, payslipId)),
  );
}

function dbError(work: Promise<unknown>): Promise<string> {
  return work.then(
    () => "",
    (error: unknown) => String(error instanceof Error && error.cause instanceof Error ? error.cause.message : error),
  );
}

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: inject("testDatabaseUrl") });
  db = drizzle({ client: pool, schema });
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();
  server = app.getHttpServer();
  queue = app.get<PayslipQueue>(PAYSLIP_QUEUE);
  storage = app.get(FileStorage);
});

afterEach(() => {
  vi.useRealTimers();
});

afterAll(async () => {
  await queue?.obliterate({ force: true });
  await app?.close();
  await pool?.end();
});

describe("slip gaji", () => {
  it("finalisasi membuat slip untuk karyawan dihitung + job antrean; terbit, portal, email, proses ulang", async () => {
    const f = await createFixture("Kopi Slip");

    // ——— Setelah final: 2 slip menunggu (Gita dikeluarkan → tanpa slip), job buat PDF per slip
    let run = await slips(f);
    expect(run.run).toMatchObject({ id: f.runId, month: "2026-10", periodStart: "2026-10-01", periodEnd: "2026-10-31", payDate: "2026-10-25" });
    expect(run.excludedCount).toBe(1);
    expect(run.rows.map((row) => [row.employee.fullName, row.status, row.hasPortalAccount, row.publishedAt, row.email])).toEqual([
      ["Eka Putri", "pending", true, null, null],
      ["Fajar Nugroho", "pending", false, null, null],
    ]);
    const eka = slipOf(run, f.eka);
    const fajar = slipOf(run, f.fajar);
    expect(Number(eka.takeHomePay)).toBeGreaterThan(0);
    for (const row of run.rows) {
      const job = await queue.getJob(row.id);
      expect(job?.name).toBe(PAYSLIP_GENERATE_JOB);
      expect(job?.data).toEqual({ tenantId: f.tenantId, payslipId: row.id });
    }

    // ——— Akses: atasan & karyawan tidak bisa membuka halaman slip periode
    const atasan = await tokenOf(f.emails.atasan);
    const karyawan = await tokenOf(f.emails.karyawan);
    expect((await send("get", atasan, `/payroll/runs/${f.runId}/slips`)).status).toBe(403);
    expect((await send("get", karyawan, `/payroll/runs/${f.runId}/slips/${eka.id}/pdf`)).status).toBe(403);

    // ——— Belum siap: tidak bisa dibuka / diterbitkan
    expect((await send("get", f.admin, `/payroll/runs/${f.runId}/slips/${eka.id}/pdf`)).status).toBe(409);
    expect((await send("post", f.admin, `/payroll/runs/${f.runId}/slips/publish`)).status).toBe(409);

    // ——— Worker: Eka siap, Fajar gagal. Admin membuka PDF sebelum terbit; karyawan belum melihat apa pun
    await markReady(f, eka.id);
    await markFailed(f, fajar.id);
    const pdf = await send("get", f.admin, `/payroll/runs/${f.runId}/slips/${eka.id}/pdf`).buffer(true).parse((res, done) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => done(null, Buffer.concat(chunks)));
    });
    expect(pdf.status).toBe(200);
    expect(pdf.headers["content-type"]).toBe("application/pdf");
    expect(pdf.headers["content-disposition"]).toBe('inline; filename="Slip-Gaji-2026-10-Eka-Putri.pdf"');
    expect(Buffer.compare(pdf.body as Buffer, PDF)).toBe(0);
    expect((await send("get", karyawan, "/payroll/me/payslips")).body.data).toEqual({ access: "ok", payslips: [] });
    expect((await send("get", karyawan, `/payroll/me/payslips/${eka.id}/pdf`)).status).toBe(404);

    // ——— Proses ulang: slip gagal kembali menunggu + job baru
    let res = await send("post", f.admin, `/payroll/runs/${f.runId}/slips/retry`);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data).toEqual({ queued: 1 });
    expect(slipOf(await slips(f), f.fajar)).toMatchObject({ status: "pending", error: null });
    const retried = (await queue.getJobs(["waiting", "delayed", "prioritized"])).filter((job) => job.data.payslipId === fajar.id);
    expect(retried.length).toBe(2);

    // ——— Terbitkan: hanya slip siap (Eka) → email antre ke akun portal Eka
    res = await send("post", f.admin, `/payroll/runs/${f.runId}/slips/publish`);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data).toEqual({ published: 1, emailed: 1 });
    run = await slips(f);
    expect(slipOf(run, f.eka)).toMatchObject({ status: "ready", email: { status: "queued", to: f.emails.karyawan, sentAt: null, error: null } });
    expect(slipOf(run, f.eka).publishedAt).not.toBeNull();
    expect(slipOf(run, f.fajar).publishedAt).toBeNull();
    const emailJobs = (await queue.getJobs(["waiting", "delayed", "prioritized"])).filter((job) => job.name === PAYSLIP_EMAIL_JOB);
    expect(emailJobs.map((job) => job.data)).toEqual([{ tenantId: f.tenantId, payslipId: eka.id }]);
    expect((await send("post", f.admin, `/payroll/runs/${f.runId}/slips/publish`)).status).toBe(409);

    // Fajar siap belakangan → terbit tanpa email (tidak punya akun portal)
    await markReady(f, fajar.id);
    res = await send("post", f.admin, `/payroll/runs/${f.runId}/slips/publish`);
    expect(res.body.data).toEqual({ published: 1, emailed: 0 });
    expect((await send("post", f.admin, `/payroll/runs/${f.runId}/slips/${fajar.id}/email`)).status).toBe(409);

    // ——— Kirim ulang: ditolak selama masih antre, boleh setelah terkirim
    expect((await send("post", f.admin, `/payroll/runs/${f.runId}/slips/${eka.id}/email`)).status).toBe(409);
    await withTenant(db, { tenantId: f.tenantId, userId: null }, (tx) =>
      tx.update(payslips).set({ emailStatus: "sent", emailSentAt: new Date() }).where(eq(payslips.id, eka.id)),
    );
    res = await send("post", f.admin, `/payroll/runs/${f.runId}/slips/${eka.id}/email`);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(slipOf(await slips(f), f.eka).email).toMatchObject({ status: "queued", sentAt: null });

    // ——— Portal: karyawan melihat & mengunduh slip sendiri yang terbit; slip orang lain 404
    const mine = (await send("get", karyawan, "/payroll/me/payslips")).body.data;
    expect(mine).toMatchObject({
      access: "ok",
      payslips: [{ id: eka.id, month: "2026-10", periodStart: "2026-10-01", periodEnd: "2026-10-31", payDate: "2026-10-25", takeHomePay: eka.takeHomePay }],
    });
    expect((await send("get", karyawan, `/payroll/me/payslips/${eka.id}/pdf`)).status).toBe(200);
    expect((await send("get", karyawan, `/payroll/me/payslips/${fajar.id}/pdf`)).status).toBe(404);
    // Atasan tanpa data karyawan tertaut
    expect((await send("get", atasan, "/payroll/me/payslips")).body.data).toEqual({ access: "not_linked" });

    // ——— Audit
    const audit = await withTenant(db, { tenantId: f.tenantId, userId: null }, (tx) =>
      tx.select({ entity: auditLogs.entity, action: auditLogs.action, after: auditLogs.after }).from(auditLogs).where(eq(auditLogs.tenantId, f.tenantId)),
    );
    expect(audit.filter((entry) => entry.action === "publish_payslips").map((entry) => entry.after)).toEqual([
      { published: [eka.id], emailed: 1 },
      { published: [fajar.id], emailed: 0 },
    ]);
    expect(audit.filter((entry) => entry.action === "resend_email").map((entry) => entry.entity)).toEqual(["payslip"]);

    // ——— Kunci DB: slip siap/terbit tidak bisa diubah; slip hanya untuk karyawan dihitung; tanpa DELETE
    const ctx = { tenantId: f.tenantId, userId: null };
    expect(await dbError(withTenant(db, ctx, (tx) => tx.update(payslips).set({ fileKey: "lain.pdf" }).where(eq(payslips.id, eka.id))))).toMatch(
      /tidak bisa diubah/,
    );
    expect(await dbError(withTenant(db, ctx, (tx) => tx.update(payslips).set({ publishedAt: null }).where(eq(payslips.id, eka.id))))).toMatch(
      /tidak bisa diubah/,
    );
    expect(await dbError(withTenant(db, ctx, (tx) => tx.insert(payslips).values({ tenantId: f.tenantId, runId: f.runId, employeeId: f.gita })))).toMatch(
      /hanya untuk karyawan yang dihitung/,
    );
    expect(await dbError(withTenant(db, ctx, (tx) => tx.delete(payslips).where(eq(payslips.id, eka.id))))).toMatch(/permission denied/);

    // ——— Usaha lain tidak melihat slip ini
    const other = await withTenant(db, { tenantId: randomUUID(), userId: null }, (tx) =>
      tx.select({ id: payslips.id }).from(payslips).where(and(eq(payslips.runId, f.runId))),
    );
    expect(other).toEqual([]);
  });

  it("slip belum ada selama periode masih draf", async () => {
    const f = await createFixture("Kopi Draf");
    vi.setSystemTime(new Date("2026-11-05T03:00:00Z"));
    const draftId: string = (await send("post", f.admin, "/payroll/runs", { month: "2026-11" })).body.data.id;
    const res = await send("get", f.admin, `/payroll/runs/${draftId}/slips`);
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("Slip gaji dibuat setelah payroll periode ini final");
  });
});

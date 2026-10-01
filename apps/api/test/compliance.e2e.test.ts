import "reflect-metadata";
import { randomUUID } from "node:crypto";

import * as schema from "@exapay/db";
import { auditLogs, complianceReminders, departments, employees, memberships, positions, tenants, users } from "@exapay/db";
import type { ComplianceCalendar, MembershipRole } from "@exapay/shared";
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

// Verifikasi feature 33 (API): pengingat muncul di tanggal yang benar (BPJS, PPh 21, kontrak, percobaan), terlewat lintas
// bulan, tandai selesai/batalkan (idempoten + audit), kunci basi setelah tanggal kontrak diubah, akses owner/admin saja.

const PASSWORD = "password-compliance-123";
const ROLES = ["owner", "admin", "atasan", "karyawan"] as const;

let app: INestApplication;
let server: Parameters<typeof request>[0];
let pool: pg.Pool;
let db: Database;

type Fixture = {
  tenantId: string;
  emails: Record<MembershipRole, string>;
  andi: string;
  budi: string;
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

async function calendar(token: string, query = ""): Promise<ComplianceCalendar> {
  const res = await send("get", token, `/compliance${query}`);
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body.data;
}

function summaryOf(items: ComplianceCalendar["reminders"]): string[] {
  return items.map((item) => `${item.dueDate} ${item.key.replace(/:[0-9a-f-]{36}:/, ":<id>:")} ${item.status} ${item.daysUntil}`);
}

// Usaha terdaftar 1 Sep 2026 (Makassar, WITA). Senin 5 Okt 2026 11:00 WITA.
// Eka tetap · Andi kontrak s.d. 20 Okt 2026 · Budi percobaan s.d. 3 Nov 2026.
async function createFixture(name: string): Promise<Fixture> {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-05T03:00:00Z"));
  const tenantId = randomUUID();
  const passwordHash = await hash(PASSWORD);
  const emails: Record<MembershipRole, string> = { owner: "", admin: "", atasan: "", karyawan: "" };
  for (const role of ROLES) {
    const id = randomUUID();
    emails[role] = `${role}-${randomUUID().slice(0, 8)}@test.exapay.local`;
    await withUser(db, id, (tx) => tx.insert(users).values({ id, email: emails[role], fullName: `${role} ${name}`, passwordHash, emailVerifiedAt: new Date() }));
    await withTenant(db, { tenantId, userId: id }, async (tx) => {
      if (role === "owner") await tx.insert(tenants).values({ id: tenantId, name, regencyCode: "73.71", createdAt: new Date("2026-09-01T02:00:00Z") });
      await tx.insert(memberships).values({ tenantId, userId: id, role });
    });
  }
  return withTenant(db, { tenantId, userId: null }, async (tx) => {
    const [department] = await tx.insert(departments).values({ tenantId, name: "Operasional" }).returning({ id: departments.id });
    const [position] = await tx.insert(positions).values({ tenantId, name: "Barista" }).returning({ id: positions.id });
    if (!department || !position) throw new Error("gagal membuat departemen/jabatan");
    const base = { tenantId, departmentId: department.id, positionId: position.id, joinDate: "2025-01-01", ptkpStatus: "TK/0" as const };
    const andi = randomUUID();
    const budi = randomUUID();
    await tx.insert(employees).values([
      { ...base, fullName: "Eka", employmentStatus: "permanent" },
      { ...base, id: andi, fullName: "Andi", employmentStatus: "contract", contractEndDate: "2026-10-20" },
      { ...base, id: budi, fullName: "Budi", employmentStatus: "probation", joinDate: "2026-08-03", probationEndDate: "2026-11-03" },
    ]);
    return { tenantId, emails, andi, budi };
  });
}

async function auditActions(tenantId: string): Promise<string[]> {
  const rows = await withTenant(db, { tenantId, userId: null }, (tx) =>
    tx.select({ action: auditLogs.action, entityId: auditLogs.entityId }).from(auditLogs).where(eq(auditLogs.entity, "compliance_reminder")).orderBy(auditLogs.createdAt),
  );
  return rows.map((row) => `${row.action} ${row.entityId}`);
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

describe("kalender kepatuhan", () => {
  it("pengingat di tanggal yang benar; terlewat; tandai selesai & batalkan", async () => {
    const f = await createFixture("Kopi Patuh");
    const admin = await tokenOf(f.emails.admin);

    const october = await calendar(admin);
    expect([october.month, october.currentMonth, october.today]).toEqual(["2026-10", "2026-10", "2026-10-05"]);
    expect(summaryOf(october.reminders)).toEqual([
      "2026-10-10 bpjs_kesehatan:2026-10 open 5",
      "2026-10-15 bpjs_ketenagakerjaan:2026-09 open 10",
      "2026-10-15 pph21_payment:2026-09 open 10",
      "2026-10-20 pph21_report:2026-09 open 15",
      "2026-10-20 contract_end:<id>:2026-10-20 open 15",
    ]);
    expect(october.reminders[4]?.employee).toEqual({ id: f.andi, fullName: "Andi" });
    // Usaha terdaftar 1 Sep 2026 → tenggat September terlewat (termasuk masa Agustus); Agustus tidak diingatkan
    expect(summaryOf(october.overdue)).toEqual([
      "2026-09-10 bpjs_kesehatan:2026-09 open -25",
      "2026-09-15 bpjs_ketenagakerjaan:2026-08 open -20",
      "2026-09-15 pph21_payment:2026-08 open -20",
      "2026-09-20 pph21_report:2026-08 open -15",
    ]);
    expect(october.summary).toEqual({ overdue: 4, dueThisWeek: 1, openThisMonth: 5, doneThisMonth: 0 });

    // Bulan depan: percobaan Budi selesai 3 Nov
    const november = await calendar(admin, "?month=2026-11");
    expect(summaryOf(november.reminders)).toEqual([
      "2026-11-03 probation_end:<id>:2026-11-03 open 29",
      "2026-11-10 bpjs_kesehatan:2026-11 open 36",
      "2026-11-15 bpjs_ketenagakerjaan:2026-10 open 41",
      "2026-11-15 pph21_payment:2026-10 open 41",
      "2026-11-20 pph21_report:2026-10 open 46",
    ]);

    // Tandai selesai (idempoten — audit sekali), lalu batalkan
    expect((await send("post", admin, "/compliance/reminders/complete", { key: "bpjs_kesehatan:2026-09" })).status).toBe(200);
    expect((await send("post", admin, "/compliance/reminders/complete", { key: "bpjs_kesehatan:2026-09" })).status).toBe(200);
    const afterDone = await calendar(admin, "?month=2026-09");
    const doneItem = afterDone.reminders.find((item) => item.key === "bpjs_kesehatan:2026-09");
    expect([doneItem?.status, doneItem?.doneByName]).toEqual(["done", "admin Kopi Patuh"]);
    expect(afterDone.overdue.map((item) => item.key)).not.toContain("bpjs_kesehatan:2026-09");
    expect(afterDone.summary.overdue).toBe(3);

    expect((await send("post", admin, "/compliance/reminders/reopen", { key: "bpjs_kesehatan:2026-09" })).status).toBe(200);
    expect((await send("post", admin, "/compliance/reminders/reopen", { key: "bpjs_kesehatan:2026-09" })).status).toBe(200);
    expect((await calendar(admin)).summary.overdue).toBe(4);
    expect(await auditActions(f.tenantId)).toEqual(["complete bpjs_kesehatan:2026-09", "reopen bpjs_kesehatan:2026-09"]);
  });

  it("tanggal kontrak diubah → pengingat lama tidak berlaku; kunci tidak valid/asing ditolak", async () => {
    const f = await createFixture("Kopi Kontrak");
    const owner = await tokenOf(f.emails.owner);
    const oldKey = `contract_end:${f.andi}:2026-10-20`;
    expect((await send("post", owner, "/compliance/reminders/complete", { key: oldKey })).status).toBe(200);

    // Kontrak diperpanjang s.d. 20 Apr 2027
    await withTenant(db, { tenantId: f.tenantId, userId: null }, (tx) => tx.update(employees).set({ contractEndDate: "2027-04-20" }).where(eq(employees.id, f.andi)));
    const october = await calendar(owner);
    expect(october.reminders.some((item) => item.kind === "contract_end")).toBe(false);
    expect((await calendar(owner, "?month=2027-04")).reminders.find((item) => item.kind === "contract_end")?.key).toBe(`contract_end:${f.andi}:2027-04-20`);
    expect((await send("post", owner, "/compliance/reminders/reopen", { key: oldKey })).status).toBe(404);

    expect((await send("post", owner, "/compliance/reminders/complete", { key: "bpjs_kesehatan:2026-13" })).status).toBe(400);
    expect((await send("post", owner, "/compliance/reminders/complete", { key: `probation_end:${f.andi}:2026-10-20` })).status).toBe(404);
    // Tenggat sebelum usaha terdaftar (masa Jul → 15 Agu)
    expect((await send("post", owner, "/compliance/reminders/complete", { key: "pph21_payment:2026-07" })).status).toBe(404);
    expect((await send("get", owner, "/compliance?month=2026-13")).status).toBe(400);
  });

  it("hanya owner/admin; status selesai terisolasi per usaha", async () => {
    const a = await createFixture("Kopi A");
    const b = await createFixture("Kopi B");
    for (const role of ["atasan", "karyawan"] as const) {
      const token = await tokenOf(a.emails[role]);
      expect((await send("get", token, "/compliance")).status, role).toBe(403);
      expect((await send("post", token, "/compliance/reminders/complete", { key: "bpjs_kesehatan:2026-10" })).status, role).toBe(403);
    }

    const ownerA = await tokenOf(a.emails.owner);
    expect((await send("post", ownerA, "/compliance/reminders/complete", { key: "bpjs_kesehatan:2026-10" })).status).toBe(200);
    const ownerB = await tokenOf(b.emails.owner);
    expect((await calendar(ownerB)).reminders.find((item) => item.key === "bpjs_kesehatan:2026-10")?.status).toBe("open");

    // RLS: konteks B tidak melihat & tidak bisa menulis baris A
    const seen = await withTenant(db, { tenantId: b.tenantId, userId: null }, (tx) =>
      tx.select({ id: complianceReminders.id }).from(complianceReminders).where(eq(complianceReminders.tenantId, a.tenantId)),
    );
    expect(seen).toEqual([]);
    await expect(
      withTenant(db, { tenantId: b.tenantId, userId: null }, (tx) =>
        tx.insert(complianceReminders).values({ tenantId: a.tenantId, key: "bpjs_kesehatan:2026-11", kind: "bpjs_kesehatan", dueDate: "2026-11-10" }),
      ),
    ).rejects.toThrow();
  });
});

import "reflect-metadata";
import { randomUUID } from "node:crypto";

import * as schema from "@exapay/db";
import { departments, employees, memberships, positions, tenants, users } from "@exapay/db";
import type { ComplianceCalendar, EmployeeList, MembershipRole, SalaryComponentSettings } from "@exapay/shared";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { hash } from "@node-rs/argon2";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, inject, it, vi } from "vitest";

import { AppModule } from "../src/app.module.js";
import { configureApp } from "../src/app.setup.js";
import { type Database, withTenant, withUser } from "../src/database/tenant-transaction.js";
import { seedTenantDefaults } from "../src/modules/tenants/tenant-defaults.js";

// Verifikasi feature 34 (API): karyawan di bawah upah minimum tertandai di daftar karyawan & kalender kepatuhan.
// Kota Makassar belum punya data UMK → fallback UMP Sulawesi Selatan 2026 Rp3.921.088 (seed 0022). Upah = gaji pokok +
// tunjangan tetap. Peringatan dini versi berikutnya diuji di minimum-wage-check.test.ts (seed belum punya versi 2027).

const PASSWORD = "password-umk-123";
const ROLES = ["owner", "admin", "atasan"] as const;

let app: INestApplication;
let server: Parameters<typeof request>[0];
let pool: pg.Pool;
let db: Database;

type Fixture = { emails: Record<Exclude<MembershipRole, "karyawan">, string>; ids: Record<"eka" | "fajar" | "gita" | "hana", string> };

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

// Senin 5 Okt 2026 11:00 WITA. Atasan = Eka (karyawan tertaut) dengan bawahan Fajar.
// Eka: pokok 3,5 jt + tunjangan jabatan 0,5 jt = 4 jt (patuh, padahal pokoknya saja di bawah)
// Fajar: pokok 3,5 jt + uang makan 0,6 jt (tunjangan tidak tetap — tidak dihitung) → di bawah
// Gita: gaji belum diatur · Hana: nonaktif sejak 30 Sep 2026, pokok 3 jt
async function createFixture(name: string, regencyCode: string | null): Promise<Fixture> {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-05T03:00:00Z"));
  const tenantId = randomUUID();
  const passwordHash = await hash(PASSWORD);
  const emails = { owner: "", admin: "", atasan: "" };
  const userIds = { owner: "", admin: "", atasan: "" };
  for (const role of ROLES) {
    const id = randomUUID();
    userIds[role] = id;
    emails[role] = `${role}-${randomUUID().slice(0, 8)}@test.exapay.local`;
    await withUser(db, id, (tx) => tx.insert(users).values({ id, email: emails[role], fullName: `${role} ${name}`, passwordHash, emailVerifiedAt: new Date() }));
    await withTenant(db, { tenantId, userId: id }, async (tx) => {
      if (role === "owner") {
        await tx.insert(tenants).values({ id: tenantId, name, regencyCode });
        await seedTenantDefaults(tx, { tenantId, userId: id });
      }
      await tx.insert(memberships).values({ tenantId, userId: id, role });
    });
  }
  const ids = await withTenant(db, { tenantId, userId: null }, async (tx) => {
    const [department] = await tx.insert(departments).values({ tenantId, name: "Operasional" }).returning({ id: departments.id });
    const [position] = await tx.insert(positions).values({ tenantId, name: "Barista" }).returning({ id: positions.id });
    if (!department || !position) throw new Error("gagal membuat departemen/jabatan");
    const base = { tenantId, departmentId: department.id, positionId: position.id, joinDate: "2025-01-01", ptkpStatus: "TK/0" as const, employmentStatus: "permanent" as const };
    const result = { eka: randomUUID(), fajar: randomUUID(), gita: randomUUID(), hana: randomUUID() };
    await tx.insert(employees).values({ ...base, id: result.eka, fullName: "Eka", userId: userIds.atasan });
    await tx.insert(employees).values([
      { ...base, id: result.fajar, fullName: "Fajar", supervisorId: result.eka },
      { ...base, id: result.gita, fullName: "Gita" },
      { ...base, id: result.hana, fullName: "Hana", endDate: "2026-09-30" },
    ]);
    return result;
  });

  const admin = await tokenOf(emails.admin);
  const settings = await getJson<SalaryComponentSettings>(admin, "/salary-components");
  const component = (componentName: string) => {
    const found = settings.components.find((item) => item.name === componentName);
    if (!found) throw new Error(`komponen ${componentName} tidak ada`);
    return found.id;
  };
  const salaries: [string, [string, string][]][] = [
    [ids.eka, [["Gaji Pokok", "3500000"], ["Tunjangan Jabatan", "500000"]]],
    [ids.fajar, [["Gaji Pokok", "3500000"], ["Uang Makan", "600000"]]],
    [ids.hana, [["Gaji Pokok", "3000000"]]],
  ];
  for (const [employeeId, items] of salaries) {
    const res = await send("post", admin, `/employees/${employeeId}/salary`, {
      effectiveFrom: "2025-01-01",
      items: items.map(([componentName, amount]) => ({ componentId: component(componentName), amount })),
      bpjsPrograms: ["kesehatan"],
      note: null,
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
  }
  return { emails, ids };
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

describe("peringatan upah minimum", () => {
  it("daftar karyawan & kalender kepatuhan menandai karyawan di bawah UMK/UMP; atasan tidak melihat", async () => {
    const f = await createFixture("Kopi UMK", "73.71");
    const admin = await tokenOf(f.emails.admin);
    const list = await getJson<EmployeeList>(admin, "/employees?activity=all");
    expect(list.minimumWage?.current).toEqual({
      scope: "province",
      areaName: "Sulawesi Selatan",
      monthlyAmount: "3921088.00",
      effectiveFrom: "2026-01-01",
      effectiveTo: "2026-12-31",
    });
    expect(list.minimumWage?.upcoming).toBeNull();
    expect(list.minimumWage?.flags).toEqual({ [f.ids.fajar]: { status: "below", wage: "3500000.00", minimumWage: "3921088.00", checkedOn: "2026-10-05" } });

    const calendar = await getJson<ComplianceCalendar>(admin, "/compliance");
    expect(calendar.minimumWage.locationSet).toBe(true);
    expect(calendar.minimumWage.current?.monthlyAmount).toBe("3921088.00");
    expect(calendar.minimumWage.employees).toEqual([{ employee: { id: f.ids.fajar, fullName: "Fajar" }, flag: list.minimumWage?.flags[f.ids.fajar] }]);
    // Bulan lain yang ditampilkan tidak mengubah peringatan (keadaan hari ini)
    expect((await getJson<ComplianceCalendar>(admin, "/compliance?month=2026-12")).minimumWage).toEqual(calendar.minimumWage);

    // Gaji disesuaikan → peringatan hilang
    const settings = await getJson<SalaryComponentSettings>(admin, "/salary-components");
    const basePay = settings.components.find((item) => item.name === "Gaji Pokok")?.id;
    const raise = await send("post", admin, `/employees/${f.ids.fajar}/salary`, {
      effectiveFrom: "2026-10-01",
      items: [{ componentId: basePay, amount: "3921088" }],
      bpjsPrograms: ["kesehatan"],
      note: "Penyesuaian UMP",
    });
    expect(raise.status, JSON.stringify(raise.body)).toBe(201);
    expect((await getJson<EmployeeList>(admin, "/employees")).minimumWage?.flags).toEqual({});
    expect((await getJson<ComplianceCalendar>(admin, "/compliance")).minimumWage.employees).toEqual([]);

    // Atasan: daftar bawahan tanpa data gaji
    const atasan = await tokenOf(f.emails.atasan);
    const subordinates = await getJson<EmployeeList>(atasan, "/employees");
    expect(subordinates.items.map((item) => item.fullName)).toEqual(["Fajar"]);
    expect(subordinates.minimumWage).toBeNull();
  });

  it("lokasi usaha belum diatur → tidak bisa dicek", async () => {
    const f = await createFixture("Kopi Tanpa Lokasi", null);
    const owner = await tokenOf(f.emails.owner);
    expect((await getJson<EmployeeList>(owner, "/employees")).minimumWage).toEqual({ current: null, upcoming: null, flags: {} });
    expect((await getJson<ComplianceCalendar>(owner, "/compliance")).minimumWage).toEqual({ locationSet: false, current: null, upcoming: null, employees: [] });
  });
});

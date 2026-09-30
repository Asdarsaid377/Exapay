import "reflect-metadata";
import { randomUUID } from "node:crypto";

import * as schema from "@exapay/db";
import { auditLogs, departments, employees, memberships, positions, tenants, users } from "@exapay/db";
import type { EmployeeFormInput, MembershipRole } from "@exapay/shared";
import type { INestApplication } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import { hash } from "@node-rs/argon2";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";

import { AppModule } from "../src/app.module.js";
import { configureApp } from "../src/app.setup.js";
import { FieldCipher } from "../src/common/crypto/field-cipher.js";
import { type Database, withTenant, withUser } from "../src/database/tenant-transaction.js";

// Verifikasi feature 11 (API): data karyawan — isolasi tenant, enkripsi NIK/NPWP/rekening, cakupan atasan, validasi.

const PASSWORD = "password-emp-123";
const NIK = "7371055708980004";
const NPWP = "092547816805000";
const ACCOUNT = "025391874821";

let app: INestApplication;
let server: Parameters<typeof request>[0];
let pool: pg.Pool;
let db: Database;

type Workspace = {
  tenantId: string;
  userIds: Record<MembershipRole, string>;
  tokens: Record<MembershipRole, string>;
  departmentId: string;
  positionId: string;
};

const ROLES = ["owner", "admin", "atasan", "karyawan"] as const;

async function createWorkspace(name: string): Promise<Workspace> {
  const tenantId = randomUUID();
  const passwordHash = await hash(PASSWORD);
  const emails = {} as Record<MembershipRole, string>;
  const userIds = {} as Record<MembershipRole, string>;
  for (const role of ROLES) {
    const id = randomUUID();
    userIds[role] = id;
    emails[role] = `${role}-${randomUUID().slice(0, 8)}@test.exapay.local`;
    await withUser(db, id, (tx) => tx.insert(users).values({ id, email: emails[role], fullName: `${role} ${name}`, passwordHash, emailVerifiedAt: new Date() }));
    await withTenant(db, { tenantId, userId: id }, async (tx) => {
      if (role === "owner") await tx.insert(tenants).values({ id: tenantId, name });
      await tx.insert(memberships).values({ tenantId, userId: id, role });
    });
  }
  const { departmentId, positionId } = await withTenant(db, { tenantId, userId: userIds.owner }, async (tx) => {
    const [department] = await tx.insert(departments).values({ tenantId, name: "Operasional" }).returning({ id: departments.id });
    const [position] = await tx.insert(positions).values({ tenantId, name: "Barista" }).returning({ id: positions.id });
    return { departmentId: department!.id, positionId: position!.id };
  });
  const tokens = {} as Record<MembershipRole, string>;
  for (const role of ROLES) {
    const res = await request(server).post("/auth/login").send({ email: emails[role], password: PASSWORD, client: "mobile" });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    tokens[role] = res.body.data.tokens.accessToken;
  }
  return { tenantId, userIds, tokens, departmentId, positionId };
}

function input(ws: Workspace, overrides: Partial<EmployeeFormInput> = {}): EmployeeFormInput {
  return {
    fullName: "Dewi Lestari",
    employeeNumber: null,
    email: null,
    phone: null,
    birthDate: null,
    gender: null,
    departmentId: ws.departmentId,
    positionId: ws.positionId,
    supervisorId: null,
    joinDate: "2024-02-03",
    employmentStatus: "permanent",
    contractEndDate: null,
    probationEndDate: null,
    nik: null,
    npwp: null,
    ptkpStatus: "TK/0",
    bankCode: null,
    bankAccountNumber: null,
    bankAccountHolder: null,
    userId: null,
    ...overrides,
  };
}

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

async function createEmployee(ws: Workspace, overrides: Partial<EmployeeFormInput> = {}, token = ws.tokens.owner): Promise<request.Response> {
  return request(server).post("/employees").set(auth(token)).send(input(ws, overrides));
}

async function createdId(ws: Workspace, overrides: Partial<EmployeeFormInput> = {}): Promise<string> {
  const res = await createEmployee(ws, overrides);
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body.data.id;
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

describe("isolasi tenant (RLS)", () => {
  it("karyawan tenant A tidak terlihat & tidak bisa diubah dari tenant B", async () => {
    const a = await createWorkspace("Toko Karyawan A");
    const b = await createWorkspace("Toko Karyawan B");
    const id = await createdId(a);

    const fromB = await withTenant(db, { tenantId: b.tenantId, userId: b.userIds.owner }, async (tx) => ({
      rows: await tx.select({ id: employees.id }).from(employees).where(eq(employees.id, id)),
      updated: await tx.update(employees).set({ fullName: "Diretas" }).where(eq(employees.id, id)).returning({ id: employees.id }),
    }));
    expect(fromB).toEqual({ rows: [], updated: [] });

    expect((await request(server).get(`/employees/${id}`).set(auth(b.tokens.owner))).status).toBe(404);
    const listB = await request(server).get("/employees").set(auth(b.tokens.owner));
    expect(listB.body.data.items).toEqual([]);
  });

  it("FK komposit: karyawan tenant B tidak bisa memakai departemen/jabatan tenant A", async () => {
    const a = await createWorkspace("Toko FK A");
    const b = await createWorkspace("Toko FK B");
    const res = await createEmployee(b, { departmentId: a.departmentId });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Departemen tidak ditemukan");
    expect((await createEmployee(b, { positionId: a.positionId })).status).toBe(400);
  });

  it("FK komposit: atasan & akun tenant lain ditolak", async () => {
    const a = await createWorkspace("Toko FK2 A");
    const b = await createWorkspace("Toko FK2 B");
    const supervisorA = await createdId(a, { fullName: "Atasan A" });
    expect((await createEmployee(b, { supervisorId: supervisorA })).status).toBe(400);
    const linkForeignUser = await createEmployee(b, { userId: a.userIds.karyawan });
    expect(linkForeignUser.status).toBe(400);
    expect(linkForeignUser.body.error).toBe("Akun yang dipilih bukan anggota usaha ini");
  });
});

describe("enkripsi data sensitif", () => {
  it("NIK/NPWP/rekening tersimpan terenkripsi, tampil tersamar, dan dibuka lewat reveal (tercatat audit)", async () => {
    const ws = await createWorkspace("Toko Enkripsi");
    const id = await createdId(ws, { nik: "7371 0557 0898 0004", npwp: "09.254.781.6-805.000", bankCode: "BCA", bankAccountNumber: ACCOUNT, bankAccountHolder: "Dewi" });

    const [raw] = await withTenant(db, { tenantId: ws.tenantId, userId: ws.userIds.owner }, (tx) =>
      tx
        .select({ nik: employees.nikEncrypted, nikHash: employees.nikHash, npwp: employees.npwpEncrypted, account: employees.bankAccountEncrypted })
        .from(employees)
        .where(eq(employees.id, id)),
    );
    for (const value of [raw!.nik, raw!.npwp, raw!.account]) {
      expect(value).toMatch(/^v1:[A-Za-z0-9+/]+=*$/);
      expect(value).not.toContain(NIK);
      expect(value).not.toContain(ACCOUNT);
    }
    expect(raw!.nikHash).toMatch(/^[0-9a-f]{64}$/);
    // Nilai sama dienkripsi dua kali menghasilkan ciphertext berbeda (IV acak)
    const second = await createdId(ws, { fullName: "Karyawan Lain", npwp: NPWP });
    const [secondRaw] = await withTenant(db, { tenantId: ws.tenantId, userId: ws.userIds.owner }, (tx) =>
      tx.select({ npwp: employees.npwpEncrypted }).from(employees).where(eq(employees.id, second)),
    );
    expect(secondRaw!.npwp).not.toBe(raw!.npwp);

    const detail = await request(server).get(`/employees/${id}`).set(auth(ws.tokens.admin));
    expect(detail.status).toBe(200);
    expect(detail.body.data.confidential).toEqual({
      ptkpStatus: "TK/0",
      nikMasked: "7371 •••• •••• 0004",
      npwpMasked: "••.•••.•••.•-•••.000",
      bankCode: "BCA",
      bankAccountMasked: "•••• •••• 4821",
      bankAccountHolder: "Dewi",
    });
    expect(JSON.stringify(detail.body)).not.toContain(NIK);

    const tax = await request(server).post(`/employees/${id}/reveal`).set(auth(ws.tokens.owner)).send({ section: "tax" });
    expect(tax.status).toBe(200);
    expect(tax.body.data).toMatchObject({ section: "tax", nik: NIK, npwp: NPWP, revealedBy: "owner Toko Enkripsi" });
    const bank = await request(server).post(`/employees/${id}/reveal`).set(auth(ws.tokens.owner)).send({ section: "bank" });
    expect(bank.body.data).toMatchObject({ section: "bank", bankAccountNumber: ACCOUNT });

    const logs = await withTenant(db, { tenantId: ws.tenantId, userId: ws.userIds.owner }, (tx) =>
      tx.select({ action: auditLogs.action, after: auditLogs.after }).from(auditLogs).where(and(eq(auditLogs.entity, "employee"), eq(auditLogs.entityId, id))),
    );
    expect(logs.filter((log) => log.action === "reveal_sensitive").map((log) => log.after)).toEqual([{ section: "tax" }, { section: "bank" }]);
    // Nilai sensitif tidak pernah masuk audit log
    expect(JSON.stringify(logs)).not.toContain(NIK);
    expect(JSON.stringify(logs)).not.toContain(ACCOUNT);
  });

  it("ciphertext terikat tenant & kolom (AAD) — dipindah ke konteks lain gagal didekripsi", () => {
    const cipher = app.get(FieldCipher);
    const tenantId = randomUUID();
    const payload = cipher.encrypt(NIK, { tenantId, field: "employees.nik" });
    expect(cipher.decrypt(payload, { tenantId, field: "employees.nik" })).toBe(NIK);
    expect(() => cipher.decrypt(payload, { tenantId: randomUUID(), field: "employees.nik" })).toThrow();
    expect(() => cipher.decrypt(payload, { tenantId, field: "employees.npwp" })).toThrow();
    // Blind index berbeda antar tenant untuk NIK yang sama
    expect(cipher.blindIndex(NIK, { tenantId, field: "employees.nik" })).not.toBe(cipher.blindIndex(NIK, { tenantId: randomUUID(), field: "employees.nik" }));
    expect(app.get(ConfigService).get("DATA_ENCRYPTION_KEY")).toBeTruthy();
  });

  it("ubah tanpa mengisi field sensitif mempertahankan nilai lama; NIK ganda ditolak", async () => {
    const ws = await createWorkspace("Toko Ubah Sensitif");
    const id = await createdId(ws, { nik: NIK, bankCode: "BCA", bankAccountNumber: ACCOUNT });
    const update = await request(server)
      .put(`/employees/${id}`)
      .set(auth(ws.tokens.owner))
      .send(input(ws, { fullName: "Dewi L.", nik: null, bankCode: "BCA", bankAccountNumber: null }));
    expect(update.status, JSON.stringify(update.body)).toBe(200);
    const detail = await request(server).get(`/employees/${id}`).set(auth(ws.tokens.owner));
    expect(detail.body.data.fullName).toBe("Dewi L.");
    expect(detail.body.data.confidential.nikMasked).toBe("7371 •••• •••• 0004");
    expect(detail.body.data.confidential.bankAccountMasked).toBe("•••• •••• 4821");

    const duplicate = await createEmployee(ws, { fullName: "Orang Lain", nik: NIK });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error).toBe("NIK ini sudah terdaftar untuk karyawan lain");
    // NIK sama di tenant lain boleh
    const other = await createWorkspace("Toko NIK Lain");
    expect((await createEmployee(other, { nik: NIK })).status).toBe(201);
  });
});

describe("peran & cakupan atasan", () => {
  it("atasan hanya melihat bawahan langsung, tanpa data pajak & rekening; karyawan ditolak", async () => {
    const ws = await createWorkspace("Toko Atasan");
    const boss = await createdId(ws, { fullName: "Rudi Hartono", userId: ws.userIds.atasan });
    const sub = await createdId(ws, { fullName: "Dewi Lestari", supervisorId: boss, nik: NIK });
    const other = await createdId(ws, { fullName: "Siti Rahmawati" });

    const list = await request(server).get("/employees").set(auth(ws.tokens.atasan));
    expect(list.status).toBe(200);
    expect(list.body.data.scope).toBe("subordinates");
    expect(list.body.data.items.map((e: { id: string }) => e.id)).toEqual([sub]);
    expect(list.body.data.counts).toEqual({ active: 1, inactive: 0 });

    const detail = await request(server).get(`/employees/${sub}`).set(auth(ws.tokens.atasan));
    expect(detail.status).toBe(200);
    expect(detail.body.data.confidential).toBeNull();
    expect(detail.body.data.canManage).toBe(false);
    expect((await request(server).get(`/employees/${other}`).set(auth(ws.tokens.atasan))).status).toBe(404);
    expect((await request(server).post(`/employees/${sub}/reveal`).set(auth(ws.tokens.atasan)).send({ section: "tax" })).status).toBe(403);
    expect((await createEmployee(ws, {}, ws.tokens.atasan)).status).toBe(403);
    expect((await request(server).get("/employees/options").set(auth(ws.tokens.atasan))).status).toBe(403);

    expect((await request(server).get("/employees").set(auth(ws.tokens.karyawan))).status).toBe(403);

    const ownerList = await request(server).get("/employees").set(auth(ws.tokens.owner));
    expect(ownerList.body.data.scope).toBe("all");
    expect(ownerList.body.data.total).toBe(3);
  });

  it("atasan tanpa data karyawan tertaut tidak melihat siapa pun", async () => {
    const ws = await createWorkspace("Toko Atasan Kosong");
    await createdId(ws);
    const list = await request(server).get("/employees").set(auth(ws.tokens.atasan));
    expect(list.body.data).toMatchObject({ items: [], total: 0, counts: { active: 0, inactive: 0 } });
  });
});

describe("validasi & siklus hidup", () => {
  it("kontrak wajib tanggal akhir; nomor induk unik (tanpa beda huruf besar/kecil)", async () => {
    const ws = await createWorkspace("Toko Validasi");
    const noEnd = await createEmployee(ws, { employmentStatus: "contract" });
    expect(noEnd.status).toBe(400);
    expect(noEnd.body.error).toBe("Tanggal akhir kontrak wajib diisi");
    expect((await createEmployee(ws, { employmentStatus: "contract", contractEndDate: "2027-01-01", employeeNumber: "KN-0001" })).status).toBe(201);
    const dup = await createEmployee(ws, { fullName: "Lain", employeeNumber: "kn-0001" });
    expect(dup.status).toBe(409);
    expect(dup.body.error).toBe("Nomor induk karyawan sudah dipakai karyawan lain");
  });

  it("atasan langsung tidak boleh membentuk siklus", async () => {
    const ws = await createWorkspace("Toko Siklus");
    const a = await createdId(ws, { fullName: "Ani" });
    const b = await createdId(ws, { fullName: "Budi", supervisorId: a });
    const res = await request(server).put(`/employees/${a}`).set(auth(ws.tokens.owner)).send(input(ws, { fullName: "Ani", supervisorId: b }));
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Atasan langsung tidak boleh bawahan dari karyawan ini");
  });

  it("nonaktifkan → tidak bisa diubah → aktifkan kembali; audit tercatat", async () => {
    const ws = await createWorkspace("Toko Nonaktif");
    const id = await createdId(ws);
    const tooEarly = await request(server).post(`/employees/${id}/deactivate`).set(auth(ws.tokens.admin)).send({ endDate: "2020-01-01", endReason: null });
    expect(tooEarly.status).toBe(400);
    const off = await request(server).post(`/employees/${id}/deactivate`).set(auth(ws.tokens.admin)).send({ endDate: "2026-09-30", endReason: "Mengundurkan diri" });
    expect(off.status).toBe(200);

    const active = await request(server).get("/employees").set(auth(ws.tokens.owner));
    expect(active.body.data).toMatchObject({ items: [], counts: { active: 0, inactive: 1 } });
    const inactive = await request(server).get("/employees?activity=inactive").set(auth(ws.tokens.owner));
    expect(inactive.body.data.items[0]).toMatchObject({ id, endDate: "2026-09-30" });

    expect((await request(server).put(`/employees/${id}`).set(auth(ws.tokens.owner)).send(input(ws))).status).toBe(409);
    expect((await request(server).post(`/employees/${id}/reactivate`).set(auth(ws.tokens.owner))).status).toBe(200);
    const detail = await request(server).get(`/employees/${id}`).set(auth(ws.tokens.owner));
    expect(detail.body.data).toMatchObject({ endDate: null, endReason: null });

    const actions = await withTenant(db, { tenantId: ws.tenantId, userId: ws.userIds.owner }, (tx) =>
      tx.select({ action: auditLogs.action }).from(auditLogs).where(and(eq(auditLogs.entity, "employee"), eq(auditLogs.entityId, id))),
    );
    expect(actions.map((a) => a.action).sort()).toEqual(["create", "deactivate", "reactivate"]);
  });

  it("departemen/jabatan yang masih dipakai tidak bisa dihapus", async () => {
    const ws = await createWorkspace("Toko Hapus Org");
    await createdId(ws);
    const res = await request(server).delete(`/organization/departments/${ws.departmentId}`).set(auth(ws.tokens.owner));
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("Departemen ini masih dipakai 1 karyawan. Pindahkan karyawan tersebut dulu sebelum menghapus.");
  });

  it("akun tertaut: satu akun satu karyawan; cabut akses melepas tautan; pilihan hanya akun yang belum tertaut", async () => {
    const ws = await createWorkspace("Toko Tautan");
    const id = await createdId(ws, { userId: ws.userIds.karyawan });
    const again = await createEmployee(ws, { fullName: "Lain", userId: ws.userIds.karyawan });
    expect(again.status).toBe(409);

    const options = await request(server).get(`/employees/options?excludeId=${id}`).set(auth(ws.tokens.owner));
    expect(options.status).toBe(200);
    const optionUserIds = options.body.data.users.map((u: { id: string }) => u.id);
    expect(optionUserIds).not.toContain(ws.userIds.karyawan);
    expect(optionUserIds).toContain(ws.userIds.atasan);
    expect(options.body.data.supervisors.map((s: { id: string }) => s.id)).not.toContain(id);

    const [membership] = await withTenant(db, { tenantId: ws.tenantId, userId: ws.userIds.owner }, (tx) =>
      tx.select({ id: memberships.id }).from(memberships).where(and(eq(memberships.tenantId, ws.tenantId), eq(memberships.userId, ws.userIds.karyawan))),
    );
    expect((await request(server).post(`/users/${membership!.id}/revoke`).set(auth(ws.tokens.owner))).status).toBe(200);
    const detail = await request(server).get(`/employees/${id}`).set(auth(ws.tokens.owner));
    expect(detail.body.data.userAccount).toBeNull();
  });
});

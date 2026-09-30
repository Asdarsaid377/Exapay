import "reflect-metadata";
import { randomUUID } from "node:crypto";

import * as schema from "@exapay/db";
import { auditLogs, departments, employees, memberships, positions, tenants, users } from "@exapay/db";
import { EMPLOYEE_IMPORT_COLUMNS, EMPLOYEE_IMPORT_MAX_BYTES, type EmployeeImportColumnKey, type EmployeeImportRow, type MembershipRole } from "@exapay/shared";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { hash } from "@node-rs/argon2";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import readXlsxFile from "read-excel-file/node";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import writeXlsxFile, { type Cell } from "write-excel-file/node";

import { AppModule } from "../src/app.module.js";
import { configureApp } from "../src/app.setup.js";
import { type Database, withTenant, withUser } from "../src/database/tenant-transaction.js";

// Verifikasi feature 12 (API): impor karyawan dari Excel — template, pratinjau dengan kesalahan per baris,
// simpan hanya baris valid dalam satu transaksi, atasan dari file yang sama, peran & isolasi tenant.

const PASSWORD = "password-imp-123";
const EXISTING_NIK = "7371055708980004";

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
    await tx.insert(departments).values({ tenantId, name: "Keuangan" });
    const [position] = await tx.insert(positions).values({ tenantId, name: "Barista" }).returning({ id: positions.id });
    await tx.insert(positions).values({ tenantId, name: "Kepala Toko" });
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

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

type RowInput = Partial<Record<EmployeeImportColumnKey, string | number | Date | null>>;

const BASE: RowInput = { department: "Operasional", position: "Barista", joinDate: "03/02/2024", employmentStatus: "Tetap", ptkpStatus: "TK/0" };

async function xlsx(rows: (RowInput | null)[], headers: string[] = EMPLOYEE_IMPORT_COLUMNS.map((column) => column.header)): Promise<Buffer> {
  const data: Cell[][] = [headers, ...rows.map((row) => EMPLOYEE_IMPORT_COLUMNS.map((column): Cell => (row ? (row[column.key] ?? null) : null)))];
  return writeXlsxFile(data, { sheet: "Karyawan", dateFormat: "dd/mm/yyyy" }).toBuffer();
}

function upload(path: string, token: string, file: Buffer) {
  return request(server).post(path).set(auth(token)).attach("file", file, { filename: "karyawan.xlsx", contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

async function employeesOf(ws: Workspace) {
  return withTenant(db, { tenantId: ws.tenantId, userId: ws.userIds.owner }, (tx) =>
    tx
      .select({ id: employees.id, fullName: employees.fullName, employeeNumber: employees.employeeNumber, supervisorId: employees.supervisorId, nik: employees.nikEncrypted, joinDate: employees.joinDate })
      .from(employees),
  );
}

const issuesOf = (rows: EmployeeImportRow[], rowNumber: number) => rows.find((row) => row.rowNumber === rowNumber)?.issues ?? [];

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

describe("template", () => {
  it("owner mengunduh template berisi kolom, departemen & jabatan usaha sendiri", async () => {
    const ws = await createWorkspace("Toko Template");
    const res = await request(server)
      .get("/employees/import/template")
      .set(auth(ws.tokens.owner))
      .buffer(true)
      .parse((response, callback) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("end", () => callback(null, Buffer.concat(chunks)));
      });
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("spreadsheetml");
    expect(res.headers["content-disposition"]).toContain("template-impor-karyawan.xlsx");

    const sheets = await readXlsxFile(res.body as Buffer);
    expect(sheets.map((sheet) => sheet.sheet)).toEqual(["Karyawan", "Petunjuk", "Referensi"]);
    expect(sheets[0]!.data[0]).toEqual(EMPLOYEE_IMPORT_COLUMNS.map((column) => (column.required ? `${column.header} *` : column.header)));
    const reference = sheets[2]!.data;
    expect(reference.slice(1).map((row) => row[0]).filter(Boolean)).toEqual(["Keuangan", "Operasional"]);
    expect(reference.slice(1).map((row) => row[1]).filter(Boolean)).toEqual(["Barista", "Kepala Toko"]);

    // Template kosong langsung diunggah → tidak ada baris
    const empty = await upload("/employees/import/preview", ws.tokens.owner, res.body as Buffer);
    expect(empty.status).toBe(400);
    expect(empty.body.error).toContain("Tidak ada baris karyawan");
  });

  it("atasan & karyawan ditolak", async () => {
    const ws = await createWorkspace("Toko Template Peran");
    expect((await request(server).get("/employees/import/template").set(auth(ws.tokens.atasan))).status).toBe(403);
    expect((await request(server).get("/employees/import/template").set(auth(ws.tokens.karyawan))).status).toBe(403);
  });
});

describe("pratinjau & simpan", () => {
  it("file 30 baris dengan 10 baris salah: kesalahan jelas per baris, 20 baris valid tersimpan setelah konfirmasi", async () => {
    const ws = await createWorkspace("Toko Impor 30");
    const existing = await request(server)
      .post("/employees")
      .set(auth(ws.tokens.owner))
      .send({
        fullName: "Rudi Existing",
        employeeNumber: "KN-1",
        email: null,
        phone: null,
        birthDate: null,
        gender: null,
        departmentId: ws.departmentId,
        positionId: ws.positionId,
        supervisorId: null,
        joinDate: "2023-01-02",
        employmentStatus: "permanent",
        contractEndDate: null,
        probationEndDate: null,
        nik: EXISTING_NIK,
        npwp: null,
        ptkpStatus: "K/1",
        bankCode: null,
        bankAccountNumber: null,
        bankAccountHolder: null,
        userId: null,
      });
    expect(existing.status, JSON.stringify(existing.body)).toBe(201);
    const existingId: string = existing.body.data.id;

    const valid: RowInput[] = Array.from({ length: 18 }, (_, i) => ({
      ...BASE,
      fullName: `Karyawan Impor ${i + 1}`,
      employeeNumber: `IMP-${i + 1}`,
      nik: `737101010190${String(i + 1).padStart(4, "0")}`,
      // Separuh tanggal sebagai sel tanggal Excel, separuh teks dd/mm/yyyy
      joinDate: i % 2 === 0 ? new Date(Date.UTC(2024, 1, 3)) : "03/02/2024",
      gender: i % 2 === 0 ? "L" : "Perempuan",
      bank: i === 0 ? "bca" : null,
      bankAccountNumber: i === 0 ? "0253918748" : null,
    }));
    const rows: (RowInput | null)[] = [
      ...valid, // baris 2–19
      { ...BASE, fullName: "Rina Bawahan File", supervisor: "IMP-1", department: "keuangan", position: "BARISTA" }, // 20 — atasan dari file (nomor induk)
      { ...BASE, fullName: "Sari Bawahan Lama", supervisor: "rudi existing", employmentStatus: "Kontrak", contractEndDate: "12/10/2026" }, // 21 — atasan terdaftar (nama)
      null, // 22 — baris kosong dilewati
      { ...BASE, fullName: "Salah Departemen", department: "Gudang" }, // 23
      { ...BASE, fullName: null, employeeNumber: "TANPA-NAMA" }, // 24
      { ...BASE, fullName: "NIK Pendek", nik: "12345" }, // 25
      { ...BASE, fullName: "NIK Angka", nik: 7371055708980005 }, // 26
      { ...BASE, fullName: "Kontrak Tanpa Akhir", employmentStatus: "Kontrak" }, // 27
      { ...BASE, fullName: "Dobel Satu", employeeNumber: "DUP-1" }, // 28
      { ...BASE, fullName: "Dobel Dua", employeeNumber: "dup-1" }, // 29
      { ...BASE, fullName: "Atasan Hilang", supervisor: "Tidak Ada" }, // 30
      { ...BASE, fullName: "Lingkar A", employeeNumber: "CYC-1", supervisor: "CYC-2" }, // 31
      { ...BASE, fullName: "Lingkar B", employeeNumber: "CYC-2", supervisor: "CYC-1" }, // 32
    ];
    const file = await xlsx(rows);

    const preview = await upload("/employees/import/preview", ws.tokens.admin, file);
    expect(preview.status, JSON.stringify(preview.body)).toBe(200);
    const data = preview.body.data as { rows: EmployeeImportRow[]; validCount: number; invalidCount: number };
    expect(data.rows).toHaveLength(30);
    expect(data.validCount).toBe(20);
    expect(data.invalidCount).toBe(10);
    expect(data.rows.map((row) => row.rowNumber)).not.toContain(22);

    expect(issuesOf(data.rows, 20)).toEqual([]);
    expect(data.rows.find((row) => row.rowNumber === 20)).toMatchObject({ departmentName: "Keuangan", positionName: "Barista" });
    expect(issuesOf(data.rows, 21)).toEqual([]);
    expect(issuesOf(data.rows, 23)).toEqual([{ column: "Departemen", message: 'Departemen "Gudang" tidak ditemukan. Periksa ejaan atau tambahkan di menu Organisasi.' }]);
    expect(issuesOf(data.rows, 24)).toEqual([{ column: "Nama lengkap", message: "Wajib diisi" }]);
    expect(issuesOf(data.rows, 25)).toEqual([{ column: "NIK", message: "NIK harus 16 digit" }]);
    expect(issuesOf(data.rows, 26)[0]).toMatchObject({ column: "NIK", message: expect.stringContaining("Ubah format sel menjadi Teks") });
    expect(issuesOf(data.rows, 27)).toEqual([{ column: "Akhir kontrak", message: "Tanggal akhir kontrak wajib diisi" }]);
    expect(issuesOf(data.rows, 28)).toEqual([{ column: "Nomor induk", message: "Nomor induk sama dengan baris 29." }]);
    expect(issuesOf(data.rows, 29)).toEqual([{ column: "Nomor induk", message: "Nomor induk sama dengan baris 28." }]);
    expect(issuesOf(data.rows, 30)[0]?.message).toContain('Atasan "Tidak Ada" tidak ditemukan');
    expect(issuesOf(data.rows, 31)[0]?.message).toContain("saling menunjuk");
    expect(issuesOf(data.rows, 32)[0]?.message).toContain("saling menunjuk");
    // Data sensitif tidak pernah dikirim balik di pratinjau
    expect(JSON.stringify(preview.body)).not.toContain("7371010101900001");
    // Pratinjau tidak menyimpan apa pun
    expect(await employeesOf(ws)).toHaveLength(1);

    const commit = await upload("/employees/import", ws.tokens.owner, file);
    expect(commit.status, JSON.stringify(commit.body)).toBe(201);
    expect(commit.body.data).toEqual({ imported: 20, skipped: 10 });

    const saved = await employeesOf(ws);
    expect(saved).toHaveLength(21);
    const byName = new Map(saved.map((employee) => [employee.fullName, employee]));
    expect(byName.get("Rina Bawahan File")?.supervisorId).toBe(byName.get("Karyawan Impor 1")?.id);
    expect(byName.get("Sari Bawahan Lama")?.supervisorId).toBe(existingId);
    expect(byName.get("Karyawan Impor 1")?.joinDate).toBe("2024-02-03");
    expect(byName.get("Karyawan Impor 2")?.joinDate).toBe("2024-02-03");
    expect(byName.get("Karyawan Impor 1")?.nik).toMatch(/^v1:/);
    expect(byName.has("Salah Departemen")).toBe(false);

    const detail = await request(server).get(`/employees/${byName.get("Karyawan Impor 1")?.id}`).set(auth(ws.tokens.owner));
    expect(detail.body.data.confidential).toMatchObject({ nikMasked: "7371 •••• •••• 0001", bankCode: "BCA", bankAccountMasked: "•••• •••• 8748" });
    expect(detail.body.data).toMatchObject({ gender: "male", employmentStatus: "permanent" });

    const audits = await withTenant(db, { tenantId: ws.tenantId, userId: ws.userIds.owner }, (tx) =>
      tx.select({ after: auditLogs.after }).from(auditLogs).where(and(eq(auditLogs.entity, "employee"), eq(auditLogs.action, "create"))),
    );
    const imported = audits.filter((audit) => (audit.after as { source?: string }).source === "import");
    expect(imported).toHaveLength(20);
    expect(JSON.stringify(imported)).not.toContain("7371010101900001");

    // Unggah ulang file yang sama: semua baris valid sebelumnya kini bentrok nomor induk/NIK
    const again = await upload("/employees/import/preview", ws.tokens.owner, file);
    expect(again.body.data.validCount).toBe(1);
    expect(issuesOf(again.body.data.rows, 2)).toEqual(
      expect.arrayContaining([
        { column: "Nomor induk", message: "Nomor induk sudah dipakai Karyawan Impor 1." },
        { column: "NIK", message: "NIK sudah terdaftar untuk Karyawan Impor 1." },
      ]),
    );
  });

  it("kesalahan lain: atasan di baris bermasalah, status & tanggal tidak dikenali, atasan ganda", async () => {
    const ws = await createWorkspace("Toko Impor Lain");
    await withTenant(db, { tenantId: ws.tenantId, userId: ws.userIds.owner }, (tx) =>
      tx.insert(employees).values([
        { tenantId: ws.tenantId, fullName: "Budi Sama", departmentId: ws.departmentId, positionId: ws.positionId, joinDate: "2023-01-01", employmentStatus: "permanent", ptkpStatus: "TK/0" },
        { tenantId: ws.tenantId, fullName: "Budi Sama", departmentId: ws.departmentId, positionId: ws.positionId, joinDate: "2023-01-01", employmentStatus: "permanent", ptkpStatus: "TK/0" },
      ]),
    );
    const file = await xlsx([
      { ...BASE, fullName: "Atasan Rusak", employeeNumber: "BOSS", department: "Tidak Ada" }, // 2
      { ...BASE, fullName: "Ikut Rusak", supervisor: "BOSS" }, // 3
      { ...BASE, fullName: "Status Aneh", employmentStatus: "Magang" }, // 4
      { ...BASE, fullName: "Tanggal Aneh", joinDate: "31/02/2024" }, // 5
      { ...BASE, fullName: "Atasan Ganda", supervisor: "Budi Sama" }, // 6
      { ...BASE, fullName: "Diri Sendiri", employeeNumber: "SELF", supervisor: "self" }, // 7
      { ...BASE, fullName: "PKWT Valid", employmentStatus: "PKWT", contractEndDate: "2026-12-31", ptkpStatus: "k1", gender: "laki-laki" }, // 8
    ]);
    const res = await upload("/employees/import/preview", ws.tokens.owner, file);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const rows = res.body.data.rows as EmployeeImportRow[];
    expect(issuesOf(rows, 3)).toEqual([{ column: "Atasan langsung", message: "Atasan di baris 2 masih bermasalah. Perbaiki baris itu juga." }]);
    expect(issuesOf(rows, 4)).toEqual([{ column: "Status kerja", message: "Isi Tetap, Kontrak, atau Percobaan" }]);
    expect(issuesOf(rows, 5)[0]).toMatchObject({ column: "Tanggal masuk", message: expect.stringContaining("Tanggal tidak dikenali") });
    expect(issuesOf(rows, 6)[0]?.message).toBe('Ada lebih dari satu karyawan "Budi Sama". Tulis nomor induk atasan.');
    expect(issuesOf(rows, 7)[0]?.message).toBe("Karyawan tidak boleh menjadi atasan dirinya sendiri.");
    expect(issuesOf(rows, 8)).toEqual([]);
    expect(res.body.data.validCount).toBe(1);
  });

  it("tanpa baris valid → simpan ditolak; header salah & file bukan xlsx ditolak dengan pesan jelas", async () => {
    const ws = await createWorkspace("Toko Impor Tolak");
    const invalidOnly = await upload("/employees/import", ws.tokens.owner, await xlsx([{ ...BASE, fullName: "X", department: "Gudang" }]));
    expect(invalidOnly.status).toBe(400);
    expect(invalidOnly.body.error).toContain("Tidak ada baris yang bisa diimpor");

    const wrongHeader = await upload("/employees/import/preview", ws.tokens.owner, await xlsx([{ fullName: "X" }], ["Nama", "Departemen"]));
    expect(wrongHeader.status).toBe(400);
    expect(wrongHeader.body.error).toBe("Kolom wajib tidak ditemukan: Nama lengkap, Jabatan, Tanggal masuk, Status kerja, Status PTKP. Unduh template dari halaman impor lalu salin data ke sana.");

    const notExcel = await upload("/employees/import/preview", ws.tokens.owner, Buffer.from("nama,nik\nDewi,123"));
    expect(notExcel.status).toBe(400);
    expect(notExcel.body.error).toBe("File bukan Excel .xlsx yang valid.");

    const legacy = await upload("/employees/import/preview", ws.tokens.owner, Buffer.concat([Buffer.from([0xd0, 0xcf, 0x11, 0xe0]), Buffer.alloc(100)]));
    expect(legacy.body.error).toContain(".xls (Excel lama)");

    const tooLarge = await upload("/employees/import/preview", ws.tokens.owner, Buffer.alloc(EMPLOYEE_IMPORT_MAX_BYTES + 1));
    expect(tooLarge.status).toBe(413);
    expect(tooLarge.body.error).toBe("File terlalu besar");

    const noFile = await request(server).post("/employees/import/preview").set(auth(ws.tokens.owner));
    expect(noFile.status).toBe(400);
    expect(noFile.body.error).toBe("Pilih file Excel (.xlsx) untuk diunggah");
  });

  it("atasan & karyawan tidak bisa pratinjau/impor; departemen tenant lain tidak dikenali", async () => {
    const a = await createWorkspace("Toko Impor Peran A");
    const b = await createWorkspace("Toko Impor Peran B");
    await withTenant(db, { tenantId: a.tenantId, userId: a.userIds.owner }, (tx) => tx.insert(departments).values({ tenantId: a.tenantId, name: "Khusus A" }));
    const file = await xlsx([{ ...BASE, fullName: "Dewi", department: "Khusus A" }]);

    expect((await upload("/employees/import/preview", b.tokens.atasan, file)).status).toBe(403);
    expect((await upload("/employees/import", b.tokens.karyawan, file)).status).toBe(403);
    const fromB = await upload("/employees/import/preview", b.tokens.owner, file);
    expect(issuesOf(fromB.body.data.rows, 2)[0]?.column).toBe("Departemen");
    expect(await employeesOf(b)).toHaveLength(0);
  });
});

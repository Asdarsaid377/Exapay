import { randomUUID } from "node:crypto";

import * as schema from "@exapay/db";
import {
  attendanceDeductionRules,
  attendanceRecords,
  departments,
  employees,
  employeeSalaries,
  employeeSalaryItems,
  kpiIndicators,
  kpiTemplates,
  leaveRequests,
  memberships,
  payrollAdjustments,
  payrollRuns,
  positions,
  salaryComponents,
  taskLogs,
  tenants,
  users,
} from "@exapay/db";
import type { BpjsProgram, EmploymentStatus, LeaveType, MembershipRole, PtkpStatus } from "@exapay/shared";
import { ConfigService } from "@nestjs/config";
import { hash } from "@node-rs/argon2";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";

import { FieldCipher } from "../common/crypto/field-cipher.js";
import type { Env } from "../common/config/env.js";
import { seedTenantDefaults } from "../modules/tenants/tenant-defaults.js";

// Data uji coba "sudah production 1 bulan": usaha terpisah "Roti Sinar Pagi (Uji Coba)" (Kota Makassar, WITA) dengan
// 15 karyawan dan operasional September 2026 — absensi harian (telat, alpa, lupa pulang), izin/sakit/cuti, log tugas
// harian + verifikasi atasan, gaji berlaku-tanggal, aturan potongan, dan periode payroll September (draf, siap dicoba
// finalisasi). Sengaja berisi kasus tepi: karyawan baru tengah bulan, resign tengah bulan, gaji di bawah UMP, karyawan
// tanpa gaji, pengajuan menunggu/ditolak, log tugas menunggu/ditolak/dikoreksi.
// Jalankan: pnpm --filter @exapay/api db:seed-trial — hanya development, idempotent (dilewati bila sudah ada).
// Memakai role app_owner (DATABASE_MIGRATION_URL); RLS tetap berlaku (FORCE) — setiap insert dengan konteks tenant.

const PASSWORD = "password123";
const DOMAIN = "sinarpagi.local";
const TENANT_NAME = "Roti Sinar Pagi (Uji Coba)";
const TIME_ZONE = "Asia/Makassar";
const MONTH_FROM = "2026-09-01";
const MONTH_TO = "2026-09-30";

type Dept = "Produksi" | "Toko" | "Penjualan" | "Gudang" | "Kantor";
type Pos = "Kepala Produksi" | "Staf Produksi" | "Supervisor Toko" | "Kasir" | "Sales" | "Admin Gudang" | "Staf Admin & Keuangan";

type SeedEmployee = {
  key: string;
  number: string;
  fullName: string;
  gender: "male" | "female";
  birthDate: string;
  dept: Dept;
  pos: Pos;
  supervisor: string | null;
  // null = tanpa akun (mis. sudah resign, akses dicabut)
  role: MembershipRole | null;
  joinDate: string;
  status: EmploymentStatus;
  contractEnd?: string;
  probationEnd?: string;
  endDate?: string;
  ptkp: PtkpStatus;
  bank: string;
  // Versi gaji: [berlaku mulai, komponen → nominal, program BPJS]; kosong = gaji belum diatur
  salaries: { from: string; items: Record<string, string>; bpjs: BpjsProgram[] }[];
  // Hari tanpa absen & tanpa pengajuan (alpa)
  absent?: string[];
  // Telat: tanggal → menit
  late?: Record<string, number>;
  // Lupa absen pulang
  noCheckOut?: string[];
};

const ALL_BPJS: BpjsProgram[] = ["kesehatan", "jht", "jp", "jkk", "jkm"];
const PRODUCTION_ITEMS = (base: string) => ({ "Gaji Pokok": base, "Uang Makan": "500000", "Tunjangan Kehadiran": "300000" });
const STORE_ITEMS = (base: string) => ({ "Gaji Pokok": base, "Uang Makan": "500000", "Tunjangan Kehadiran": "250000" });

const EMPLOYEES: SeedEmployee[] = [
  {
    key: "hendra",
    number: "SP-001",
    fullName: "Hendra Wijaya",
    gender: "male",
    birthDate: "1985-03-12",
    dept: "Produksi",
    pos: "Kepala Produksi",
    supervisor: null,
    role: "atasan",
    joinDate: "2019-02-01",
    status: "permanent",
    ptkp: "K/2",
    bank: "BCA",
    salaries: [
      { from: "2026-01-01", items: { "Gaji Pokok": "5500000", "Tunjangan Jabatan": "1000000", "Uang Makan": "600000", "Uang Transport": "400000" }, bpjs: ALL_BPJS },
      { from: "2026-07-01", items: { "Gaji Pokok": "6000000", "Tunjangan Jabatan": "1000000", "Uang Makan": "600000", "Uang Transport": "400000" }, bpjs: ALL_BPJS },
    ],
  },
  {
    key: "agus",
    number: "SP-002",
    fullName: "Agus Salim",
    gender: "male",
    birthDate: "1990-07-21",
    dept: "Produksi",
    pos: "Staf Produksi",
    supervisor: "hendra",
    role: "karyawan",
    joinDate: "2021-05-10",
    status: "permanent",
    ptkp: "K/1",
    bank: "BRI",
    salaries: [{ from: "2026-01-01", items: { ...PRODUCTION_ITEMS("4000000"), "Cicilan Pinjaman": "250000" }, bpjs: ALL_BPJS }],
    late: { "2026-09-17": 95 },
  },
  {
    key: "bayu",
    number: "SP-003",
    fullName: "Bayu Pratama",
    gender: "male",
    birthDate: "1997-11-02",
    dept: "Produksi",
    pos: "Staf Produksi",
    supervisor: "hendra",
    role: "karyawan",
    joinDate: "2023-08-01",
    status: "permanent",
    ptkp: "TK/0",
    bank: "BRI",
    salaries: [{ from: "2026-01-01", items: PRODUCTION_ITEMS("4000000"), bpjs: ALL_BPJS }],
    absent: ["2026-09-29"],
    late: { "2026-09-03": 15, "2026-09-09": 35, "2026-09-16": 50, "2026-09-24": 20 },
  },
  {
    key: "cahyo",
    number: "SP-004",
    fullName: "Cahyo Nugroho",
    gender: "male",
    birthDate: "2000-01-30",
    dept: "Produksi",
    pos: "Staf Produksi",
    supervisor: "hendra",
    role: "karyawan",
    joinDate: "2024-02-12",
    status: "permanent",
    ptkp: "TK/0",
    bank: "BNI",
    // Gaji pokok di bawah UMP Sulsel 2026 (Rp3.921.088); belum ikut JHT/JP
    salaries: [{ from: "2026-01-01", items: PRODUCTION_ITEMS("3600000"), bpjs: ["kesehatan", "jkk", "jkm"] }],
  },
  {
    key: "dedi",
    number: "SP-005",
    fullName: "Dedi Kurniawan",
    gender: "male",
    birthDate: "1994-09-14",
    dept: "Produksi",
    pos: "Staf Produksi",
    supervisor: "hendra",
    role: "karyawan",
    joinDate: "2022-10-03",
    status: "permanent",
    ptkp: "K/0",
    bank: "MANDIRI",
    salaries: [{ from: "2026-01-01", items: PRODUCTION_ITEMS("4000000"), bpjs: ALL_BPJS }],
    absent: ["2026-09-08", "2026-09-22"],
  },
  {
    key: "eko",
    number: "SP-006",
    fullName: "Eko Prasetyo",
    gender: "male",
    birthDate: "1998-04-08",
    dept: "Produksi",
    pos: "Staf Produksi",
    supervisor: "hendra",
    role: null,
    joinDate: "2023-01-09",
    status: "permanent",
    endDate: "2026-09-18",
    ptkp: "TK/0",
    bank: "BRI",
    salaries: [{ from: "2026-01-01", items: PRODUCTION_ITEMS("4100000"), bpjs: ALL_BPJS }],
  },
  {
    key: "fitri",
    number: "SP-007",
    fullName: "Fitri Handayani",
    gender: "female",
    birthDate: "1988-12-05",
    dept: "Toko",
    pos: "Supervisor Toko",
    supervisor: null,
    role: "atasan",
    joinDate: "2020-06-15",
    status: "permanent",
    ptkp: "K/1",
    bank: "BCA",
    salaries: [
      { from: "2026-01-01", items: { "Gaji Pokok": "5500000", "Tunjangan Jabatan": "750000", "Uang Makan": "600000", "Uang Transport": "400000" }, bpjs: ALL_BPJS },
    ],
  },
  {
    key: "gita",
    number: "SP-008",
    fullName: "Gita Permata",
    gender: "female",
    birthDate: "2001-06-18",
    dept: "Toko",
    pos: "Kasir",
    supervisor: "fitri",
    role: "karyawan",
    joinDate: "2025-11-01",
    status: "contract",
    contractEnd: "2026-10-31",
    ptkp: "TK/0",
    bank: "BSI",
    salaries: [{ from: "2025-11-01", items: STORE_ITEMS("3950000"), bpjs: ALL_BPJS }],
    late: { "2026-09-07": 12, "2026-09-25": 8 },
  },
  {
    key: "hana",
    number: "SP-009",
    fullName: "Hana Safitri",
    gender: "female",
    birthDate: "1999-02-27",
    dept: "Toko",
    pos: "Kasir",
    supervisor: "fitri",
    role: "karyawan",
    joinDate: "2024-07-01",
    status: "permanent",
    ptkp: "TK/1",
    bank: "BRI",
    salaries: [{ from: "2026-01-01", items: STORE_ITEMS("3950000"), bpjs: ALL_BPJS }],
  },
  {
    key: "indah",
    number: "SP-010",
    fullName: "Indah Lestari",
    gender: "female",
    birthDate: "1996-10-10",
    dept: "Toko",
    pos: "Kasir",
    supervisor: "fitri",
    role: "karyawan",
    joinDate: "2022-03-14",
    status: "permanent",
    ptkp: "K/0",
    bank: "MANDIRI",
    salaries: [{ from: "2026-01-01", items: STORE_ITEMS("3950000"), bpjs: ALL_BPJS }],
  },
  {
    key: "joko",
    number: "SP-011",
    fullName: "Joko Susilo",
    gender: "male",
    birthDate: "1993-05-25",
    dept: "Penjualan",
    pos: "Sales",
    supervisor: "fitri",
    role: "karyawan",
    joinDate: "2021-09-01",
    status: "permanent",
    ptkp: "TK/0",
    bank: "BCA",
    salaries: [{ from: "2026-01-01", items: { "Gaji Pokok": "4500000", "Uang Transport": "750000", Insentif: "500000" }, bpjs: ALL_BPJS }],
    late: { "2026-09-02": 25, "2026-09-08": 40, "2026-09-14": 70, "2026-09-18": 30, "2026-09-23": 45, "2026-09-30": 28 },
    noCheckOut: ["2026-09-11"],
  },
  {
    key: "kurnia",
    number: "SP-012",
    fullName: "Kurnia Ramadhan",
    gender: "male",
    birthDate: "2002-08-03",
    dept: "Penjualan",
    pos: "Sales",
    supervisor: "fitri",
    role: "karyawan",
    joinDate: "2026-09-14",
    status: "probation",
    probationEnd: "2026-12-13",
    ptkp: "TK/0",
    bank: "BNI",
    salaries: [{ from: "2026-09-14", items: { "Gaji Pokok": "4200000", "Uang Transport": "750000" }, bpjs: ["kesehatan", "jht", "jkk", "jkm"] }],
  },
  {
    key: "lina",
    number: "SP-013",
    fullName: "Lina Marlina",
    gender: "female",
    birthDate: "1995-01-16",
    dept: "Gudang",
    pos: "Admin Gudang",
    supervisor: "hendra",
    role: "karyawan",
    joinDate: "2022-01-03",
    status: "permanent",
    ptkp: "K/1",
    bank: "BRI",
    salaries: [{ from: "2026-01-01", items: PRODUCTION_ITEMS("4300000"), bpjs: ALL_BPJS }],
    noCheckOut: ["2026-09-24"],
  },
  {
    key: "maman",
    number: "SP-014",
    fullName: "Maman Suryaman",
    gender: "male",
    birthDate: "1991-11-29",
    dept: "Gudang",
    pos: "Admin Gudang",
    supervisor: "hendra",
    role: "karyawan",
    joinDate: "2026-09-01",
    status: "contract",
    contractEnd: "2027-02-28",
    ptkp: "K/2",
    bank: "BRI",
    // Lupa diatur admin — payroll September tertahan sampai gaji diisi atau karyawan dikeluarkan
    salaries: [],
  },
  {
    key: "nur",
    number: "SP-015",
    fullName: "Nur Aisyah",
    gender: "female",
    birthDate: "1992-04-04",
    dept: "Kantor",
    pos: "Staf Admin & Keuangan",
    supervisor: null,
    role: "admin",
    joinDate: "2020-01-06",
    status: "permanent",
    ptkp: "TK/0",
    bank: "MANDIRI",
    salaries: [{ from: "2026-01-01", items: { "Gaji Pokok": "5000000", "Tunjangan Jabatan": "500000", "Uang Makan": "600000" }, bpjs: ALL_BPJS }],
  },
];

type SeedLeave = { employee: string; type: LeaveType; from: string; to: string; reason: string; status: "approved" | "rejected" | "pending"; decider?: string; note?: string; createdOn: string };

const LEAVES: SeedLeave[] = [
  { employee: "joko", type: "permit", from: "2026-09-04", to: "2026-09-04", reason: "Mengurus perpanjangan SIM", status: "approved", decider: "fitri", createdOn: "2026-09-02" },
  { employee: "agus", type: "sick", from: "2026-09-10", to: "2026-09-10", reason: "Demam", status: "approved", decider: "hendra", createdOn: "2026-09-10" },
  { employee: "hana", type: "sick", from: "2026-09-15", to: "2026-09-16", reason: "Tipes, rawat jalan", status: "approved", decider: "fitri", createdOn: "2026-09-15" },
  { employee: "gita", type: "leave", from: "2026-09-21", to: "2026-09-23", reason: "Pernikahan kakak di Gowa", status: "approved", decider: "fitri", createdOn: "2026-09-07" },
  {
    employee: "bayu",
    type: "leave",
    from: "2026-09-28",
    to: "2026-09-28",
    reason: "Acara keluarga",
    status: "rejected",
    decider: "hendra",
    note: "Pesanan kue akhir bulan padat, mohon ajukan minggu depan",
    createdOn: "2026-09-25",
  },
  { employee: "indah", type: "leave", from: "2026-10-12", to: "2026-10-14", reason: "Pulang kampung ke Bone", status: "pending", createdOn: "2026-09-29" },
  { employee: "lina", type: "permit", from: "2026-10-05", to: "2026-10-05", reason: "Menghadiri wisuda adik", status: "pending", createdOn: "2026-09-30" },
];

// Pseudo-random deterministik — data sama setiap dijalankan
function rng(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = rng(20260930);
const between = (min: number, max: number): number => Math.floor(min + random() * (max - min + 1));
const pad = (value: number): string => String(value).padStart(2, "0");
const at = (date: string, minutesOfDay: number): Date => new Date(`${date}T${pad(Math.floor(minutesOfDay / 60))}:${pad(minutesOfDay % 60)}:00+08:00`);
const addDays = (date: string, days: number): string => new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

function workdays(from: string, to: string): string[] {
  const dates: string[] = [];
  for (let date = from; date <= to; date = addDays(date, 1)) {
    const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
    if (weekday !== 0 && weekday !== 6) dates.push(date);
  }
  return dates;
}

function digits(length: number): string {
  let value = String(between(1, 9));
  while (value.length < length) value += String(between(0, 9));
  return value;
}

async function main(): Promise<void> {
  if (process.env.NODE_ENV === "production") throw new Error("[seed-trial] tidak boleh dijalankan di production");
  const url = process.env.DATABASE_MIGRATION_URL;
  const key = process.env.DATA_ENCRYPTION_KEY;
  if (!url || !key) throw new Error("[seed-trial] DATABASE_MIGRATION_URL / DATA_ENCRYPTION_KEY belum di-set");
  const cipher = new FieldCipher(new ConfigService<Env, true>({ DATA_ENCRYPTION_KEY: key }));

  const pool = new pg.Pool({ connectionString: url });
  const db = drizzle({ client: pool, schema });
  const ownerEmail = `rahmat@${DOMAIN}`;
  try {
    const { rows } = await db.execute<{ id: string }>(sql`select id from auth_find_user_by_email(${ownerEmail})`);
    if (rows.length > 0) {
      console.log("[seed-trial] data uji coba sudah ada — dilewati");
      return;
    }
    const passwordHash = await hash(PASSWORD);
    const tenantId = randomUUID();
    const ownerId = randomUUID();
    const userIdOf = new Map<string, string>(EMPLOYEES.filter((e) => e.role).map((e) => [e.key, randomUUID()]));
    const employeeIdOf = new Map(EMPLOYEES.map((e) => [e.key, randomUUID()]));
    const id = (map: Map<string, string>, k: string): string => {
      const value = map.get(k);
      if (!value) throw new Error(`[seed-trial] id ${k} tidak ada`);
      return value;
    };
    const emailOf = (e: SeedEmployee): string => `${e.key}@${DOMAIN}`;

    await db.transaction(async (tx) => {
      const setContext = (tenant: string | null, user: string | null) =>
        tx.execute(sql`select set_config('app.tenant_id', ${tenant ?? ""}, true), set_config('app.user_id', ${user ?? ""}, true)`);

      // ——— akun ———
      const accounts = [
        { id: ownerId, email: ownerEmail, fullName: "Rahmat Hidayat" },
        ...EMPLOYEES.filter((e) => e.role).map((e) => ({ id: id(userIdOf, e.key), email: emailOf(e), fullName: e.fullName })),
      ];
      for (const account of accounts) {
        await setContext(null, account.id);
        await tx.insert(users).values({ ...account, passwordHash, emailVerifiedAt: new Date("2026-08-25T02:00:00Z") });
      }

      // ——— usaha + bawaan (jadwal Senin–Jumat 08.00–17.00, template KPI, komponen gaji) ———
      await setContext(tenantId, ownerId);
      await tx.insert(tenants).values({
        id: tenantId,
        name: TENANT_NAME,
        address: "Jl. Penghibur No. 12, Kel. Losari, Kec. Ujung Pandang, Kota Makassar",
        npwp: "012345678805000",
        regencyCode: "73.71",
        payday: 28,
        jkkRiskLevel: 2,
      });
      await seedTenantDefaults(tx, { tenantId, userId: ownerId });
      await tx.insert(memberships).values({ tenantId, userId: ownerId, role: "owner" });
      for (const e of EMPLOYEES) {
        if (e.role) await tx.insert(memberships).values({ tenantId, userId: id(userIdOf, e.key), role: e.role });
      }

      // ——— organisasi ———
      const templates = await tx.select({ id: kpiTemplates.id, name: kpiTemplates.name }).from(kpiTemplates);
      const templateOf = (name: string): string | null => templates.find((t) => t.name === name)?.id ?? null;
      const deptIds = new Map<string, string>();
      for (const name of ["Produksi", "Toko", "Penjualan", "Gudang", "Kantor"] satisfies Dept[]) {
        const [row] = await tx.insert(departments).values({ tenantId, name }).returning({ id: departments.id });
        if (row) deptIds.set(name, row.id);
      }
      const positionTemplates: Record<Pos, string | null> = {
        "Kepala Produksi": null,
        "Staf Produksi": templateOf("Staf Produksi"),
        "Supervisor Toko": null,
        Kasir: templateOf("Kasir"),
        Sales: templateOf("Sales"),
        "Admin Gudang": templateOf("Admin Gudang"),
        "Staf Admin & Keuangan": null,
      };
      const posIds = new Map<string, string>();
      for (const [name, kpiTemplateId] of Object.entries(positionTemplates)) {
        const [row] = await tx.insert(positions).values({ tenantId, name, kpiTemplateId }).returning({ id: positions.id });
        if (row) posIds.set(name, row.id);
      }

      // ——— karyawan (atasan dulu) ———
      const ordered = [...EMPLOYEES].sort((a, b) => Number(a.supervisor !== null) - Number(b.supervisor !== null));
      for (const e of ordered) {
        const nik = `7371${digits(12)}`;
        const npwp = digits(16);
        const account = digits(10);
        await tx.insert(employees).values({
          id: id(employeeIdOf, e.key),
          tenantId,
          employeeNumber: e.number,
          fullName: e.fullName,
          email: e.role ? emailOf(e) : null,
          phone: `08${digits(10)}`,
          birthDate: e.birthDate,
          gender: e.gender,
          departmentId: id(deptIds, e.dept),
          positionId: id(posIds, e.pos),
          supervisorId: e.supervisor ? id(employeeIdOf, e.supervisor) : null,
          userId: e.role ? id(userIdOf, e.key) : null,
          joinDate: e.joinDate,
          employmentStatus: e.status,
          contractEndDate: e.contractEnd ?? null,
          probationEndDate: e.probationEnd ?? null,
          nikEncrypted: cipher.encrypt(nik, { tenantId, field: "employees.nik" }),
          nikHash: cipher.blindIndex(nik, { tenantId, field: "employees.nik" }),
          npwpEncrypted: cipher.encrypt(npwp, { tenantId, field: "employees.npwp" }),
          ptkpStatus: e.ptkp,
          bankCode: e.bank,
          bankAccountEncrypted: cipher.encrypt(account, { tenantId, field: "employees.bank_account" }),
          bankAccountHolder: e.fullName.toUpperCase(),
          endDate: e.endDate ?? null,
          endReason: e.endDate ? "Mengundurkan diri — pindah ke luar kota" : null,
        });
      }

      // ——— gaji berlaku-tanggal ———
      const components = await tx.select({ id: salaryComponents.id, name: salaryComponents.name }).from(salaryComponents);
      const componentOf = (name: string): string => {
        const found = components.find((c) => c.name === name);
        if (!found) throw new Error(`[seed-trial] komponen ${name} tidak ada`);
        return found.id;
      };
      for (const e of EMPLOYEES) {
        for (const [index, version] of e.salaries.entries()) {
          const next = e.salaries[index + 1];
          const [row] = await tx
            .insert(employeeSalaries)
            .values({
              tenantId,
              employeeId: id(employeeIdOf, e.key),
              effectiveFrom: version.from,
              effectiveTo: next ? addDays(next.from, -1) : null,
              bpjsKesehatan: version.bpjs.includes("kesehatan"),
              bpjsJht: version.bpjs.includes("jht"),
              bpjsJp: version.bpjs.includes("jp"),
              bpjsJkk: version.bpjs.includes("jkk"),
              bpjsJkm: version.bpjs.includes("jkm"),
              note: index > 0 ? "Kenaikan gaji tengah tahun" : null,
              createdByUserId: ownerId,
              createdByName: "Rahmat Hidayat",
            })
            .returning({ id: employeeSalaries.id });
          if (!row) throw new Error("[seed-trial] versi gaji gagal");
          await tx
            .insert(employeeSalaryItems)
            .values(Object.entries(version.items).map(([name, amount]) => ({ tenantId, salaryId: row.id, componentId: componentOf(name), amount })));
        }
      }

      // ——— aturan potongan absensi (berlaku sejak awal tahun) ———
      await tx.insert(attendanceDeductionRules).values({
        tenantId,
        effectiveFrom: "2026-01-01",
        absenceMode: "prorate",
        absenceProrateBase: "base_salary",
        absenceDivisorMode: "actual",
        lateMode: "per_block",
        lateToleranceMinutes: 10,
        lateBlockMinutes: 30,
        lateAmount: "20000",
        lateMonthlyCap: "200000",
        permitSickMode: "after_days",
        permitSickFreeDays: 3,
        allowanceMode: "reduce_per_day",
        allowanceAmountPerDay: "15000",
        createdByUserId: ownerId,
        createdByName: "Rahmat Hidayat",
      });

      // ——— izin/sakit/cuti ———
      const nameOf = (k: string): string => EMPLOYEES.find((e) => e.key === k)?.fullName ?? k;
      const onLeave = new Set<string>();
      for (const leave of LEAVES) {
        const decided = leave.status !== "pending";
        await tx.insert(leaveRequests).values({
          tenantId,
          employeeId: id(employeeIdOf, leave.employee),
          type: leave.type,
          startDate: leave.from,
          endDate: leave.to,
          reason: leave.reason,
          status: leave.status,
          requestedByUserId: id(userIdOf, leave.employee),
          decidedAt: decided ? at(leave.createdOn, 10 * 60 + between(0, 300)) : null,
          decidedByUserId: decided && leave.decider ? id(userIdOf, leave.decider) : null,
          decidedByName: decided && leave.decider ? nameOf(leave.decider) : null,
          decisionNote: leave.note ?? null,
          createdAt: at(leave.createdOn, 8 * 60 + between(0, 60)),
        });
        if (leave.status === "approved") for (const date of workdays(leave.from, leave.to)) onLeave.add(`${leave.employee}:${date}`);
      }

      // ——— absensi + log tugas ———
      const indicators = await tx
        .select({ id: kpiIndicators.id, templateId: kpiIndicators.templateId, name: kpiIndicators.name, type: kpiIndicators.type })
        .from(kpiIndicators);
      let attendanceCount = 0;
      let taskCount = 0;
      for (const e of EMPLOYEES) {
        const employeeId = id(employeeIdOf, e.key);
        const from = e.joinDate > MONTH_FROM ? e.joinDate : MONTH_FROM;
        const to = e.endDate && e.endDate < MONTH_TO ? e.endDate : MONTH_TO;
        const templateId = positionTemplates[e.pos];
        const loggable = indicators.filter((i) => i.templateId === templateId && (i.type === "count" || i.type === "numeric"));
        const decider = e.supervisor ? EMPLOYEES.find((s) => s.key === e.supervisor) : undefined;

        for (const date of workdays(from, to)) {
          if (onLeave.has(`${e.key}:${date}`) || e.absent?.includes(date)) continue;
          const late = e.late?.[date] ?? 0;
          const checkIn = late > 0 ? 8 * 60 + late : 7 * 60 + between(35, 59);
          const checkOut = 17 * 60 + between(0, 40);
          await tx.insert(attendanceRecords).values({
            tenantId,
            employeeId,
            workDate: date,
            timeZone: TIME_ZONE,
            scheduledStart: "08:00",
            scheduledEnd: "17:00",
            lateMinutes: late,
            checkInAt: at(date, checkIn),
            checkInLatitude: -5.1477 + random() * 0.0005,
            checkInLongitude: 119.4078 + random() * 0.0005,
            checkInAccuracy: between(8, 30),
            checkOutAt: e.noCheckOut?.includes(date) ? null : at(date, checkOut),
            createdAt: at(date, checkIn),
          });
          attendanceCount += 1;

          // Log tugas: hanya karyawan berakun dengan template KPI. Menunggu = 3 hari kerja terakhir.
          if (loggable.length === 0 || !e.role || !decider?.role) continue;
          for (const indicator of loggable) {
            const quantity = taskQuantity(indicator.name, date);
            if (quantity === null) continue;
            const pending = date >= "2026-09-28";
            const roll = random();
            const status = pending ? "pending" : roll < 0.03 ? "rejected" : "approved";
            const corrected = status === "approved" && roll > 0.95;
            const verified = status === "approved" ? (corrected ? String(Math.max(1, Math.floor(Number(quantity) * 0.8))) : quantity) : null;
            await tx.insert(taskLogs).values({
              tenantId,
              employeeId,
              workDate: date,
              indicatorId: indicator.id,
              quantity,
              note: status === "rejected" ? "Rekap harian" : null,
              status,
              createdByUserId: id(userIdOf, e.key),
              verifiedQuantity: verified,
              decidedAt: pending ? null : at(addDays(date, 1), 9 * 60 + between(0, 90)),
              decidedByUserId: pending ? null : id(userIdOf, decider.key),
              decidedByName: pending ? null : decider.fullName,
              decisionNote:
                status === "rejected"
                  ? "Angka tidak cocok dengan rekap sistem kasir/gudang, mohon cek ulang"
                  : corrected
                    ? "Disesuaikan dengan rekap harian — sebagian belum selesai"
                    : null,
              createdAt: at(date, 16 * 60 + between(30, 59)),
            });
            taskCount += 1;
          }
          // Sesekali pekerjaan di luar indikator
          if (random() < 0.08) {
            await tx.insert(taskLogs).values({
              tenantId,
              employeeId,
              workDate: date,
              note: "Membantu bongkar muat bahan baku tepung & gula",
              status: date >= "2026-09-28" ? "pending" : "approved",
              createdByUserId: id(userIdOf, e.key),
              decidedAt: date >= "2026-09-28" ? null : at(addDays(date, 1), 9 * 60 + 30),
              decidedByUserId: date >= "2026-09-28" ? null : id(userIdOf, decider.key),
              decidedByName: date >= "2026-09-28" ? null : decider.fullName,
              createdAt: at(date, 16 * 60 + 45),
            });
            taskCount += 1;
          }
        }
      }

      // ——— payroll September: dibuka admin, 2 penyesuaian, masih draf ———
      const nurId = id(userIdOf, "nur");
      const [run] = await tx
        .insert(payrollRuns)
        .values({ tenantId, periodMonth: MONTH_FROM, createdByUserId: nurId, createdByName: "Nur Aisyah", createdAt: at("2026-09-29", 14 * 60) })
        .returning({ id: payrollRuns.id });
      if (!run) throw new Error("[seed-trial] periode payroll gagal");
      await setContext(tenantId, nurId);
      await tx.insert(payrollAdjustments).values([
        {
          tenantId,
          runId: run.id,
          employeeId: id(employeeIdOf, "joko"),
          kind: "add_line",
          lineKind: "variable_allowance",
          name: "Bonus target penjualan September",
          amount: "750000",
          createdByUserId: nurId,
          createdByName: "Nur Aisyah",
        },
        {
          tenantId,
          runId: run.id,
          employeeId: id(employeeIdOf, "agus"),
          kind: "add_line",
          lineKind: "deduction",
          name: "Kasbon 15 September",
          amount: "300000",
          createdByUserId: nurId,
          createdByName: "Nur Aisyah",
        },
      ]);

      console.log(`[seed-trial] ${attendanceCount} absensi, ${taskCount} log tugas, ${LEAVES.length} pengajuan, payroll September (draf)`);
    });

    // Sanity check
    await db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.tenant_id', ${tenantId}, true)`);
      const [row] = await tx.select({ total: sql<number>`count(*)::int` }).from(employees).where(eq(employees.tenantId, tenantId));
      console.log(`[seed-trial] selesai — usaha "${TENANT_NAME}", ${row?.total ?? 0} karyawan. Semua akun memakai password "${PASSWORD}":`);
    });
    console.log(`  - ${ownerEmail.padEnd(28)} owner`);
    for (const e of EMPLOYEES.filter((x) => x.role)) console.log(`  - ${emailOf(e).padEnd(28)} ${e.role} (${e.fullName}, ${e.pos})`);
  } finally {
    await pool.end();
  }
}

// Realisasi harian per indikator (target template bawaan); null = tidak dicatat hari itu
function taskQuantity(indicator: string, date: string): string | null {
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  switch (indicator) {
    case "Unit diproduksi":
      return String(between(160, 230));
    case "Transaksi dilayani":
      return String(between(55, 105));
    case "Tutup kas tanpa selisih":
      return random() < 0.9 ? "1" : null;
    case "Nilai penjualan":
      return random() < 0.85 ? String(between(8, 40) * 100_000) : null;
    case "Kunjungan pelanggan":
      return String(between(2, 7));
    case "Pelanggan baru":
      return random() < 0.3 ? "1" : null;
    case "Pesanan dikemas & dikirim":
      return String(between(25, 55));
    case "Stok opname":
      return weekday === 5 ? "1" : null;
    default:
      return null;
  }
}

main().catch((error: unknown) => {
  console.error("[seed-trial] gagal:", error);
  process.exit(1);
});

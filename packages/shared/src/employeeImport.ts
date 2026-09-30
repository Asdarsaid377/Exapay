import { z } from "zod";

import { EMPLOYMENT_STATUSES, type EmploymentStatus } from "./employees.js";

// Impor karyawan dari Excel (feature 12, /employees/import). File dibaca & divalidasi di API;
// pratinjau hanya memuat data non-sensitif (NIK/NPWP/rekening tidak pernah dikirim balik).

// Batas file: UMKM < 50 karyawan — 500 baris sudah sangat longgar
export const EMPLOYEE_IMPORT_MAX_ROWS = 500;
export const EMPLOYEE_IMPORT_MAX_BYTES = 1024 * 1024;
export const EMPLOYEE_IMPORT_SHEET = "Karyawan";

// Kolom template, urut sesuai file. Header dicocokkan tanpa membedakan huruf besar/kecil dan tanda *.
export const EMPLOYEE_IMPORT_COLUMNS = [
  { key: "fullName", header: "Nama lengkap", required: true },
  { key: "employeeNumber", header: "Nomor induk", required: false },
  { key: "email", header: "Email", required: false },
  { key: "phone", header: "No. HP", required: false },
  { key: "birthDate", header: "Tanggal lahir", required: false },
  { key: "gender", header: "Jenis kelamin", required: false },
  { key: "department", header: "Departemen", required: true },
  { key: "position", header: "Jabatan", required: true },
  { key: "supervisor", header: "Atasan langsung", required: false },
  { key: "joinDate", header: "Tanggal masuk", required: true },
  { key: "employmentStatus", header: "Status kerja", required: true },
  { key: "contractEndDate", header: "Akhir kontrak", required: false },
  { key: "probationEndDate", header: "Akhir percobaan", required: false },
  { key: "nik", header: "NIK", required: false },
  { key: "npwp", header: "NPWP", required: false },
  { key: "ptkpStatus", header: "Status PTKP", required: true },
  { key: "bank", header: "Bank", required: false },
  { key: "bankAccountNumber", header: "Nomor rekening", required: false },
  { key: "bankAccountHolder", header: "Nama pemilik rekening", required: false },
] as const;
export type EmployeeImportColumnKey = (typeof EMPLOYEE_IMPORT_COLUMNS)[number]["key"];

// Kesalahan satu sel/baris. column = header kolom (mis. "NIK") atau "Baris" untuk kesalahan tingkat baris.
export type EmployeeImportIssue = { column: string; message: string };

export type EmployeeImportRow = {
  // Nomor baris di Excel (header = baris 1)
  rowNumber: number;
  fullName: string | null;
  employeeNumber: string | null;
  departmentName: string | null;
  positionName: string | null;
  employmentStatus: EmploymentStatus | null;
  joinDate: string | null;
  // Kosong = siap diimpor
  issues: EmployeeImportIssue[];
};

export type EmployeeImportPreview = {
  rows: EmployeeImportRow[];
  validCount: number;
  invalidCount: number;
};

export type EmployeeImportResult = {
  imported: number;
  skipped: number;
};

// ——— Validasi respons API di web ———

export const employeeImportPreviewSchema: z.ZodType<EmployeeImportPreview> = z.object({
  rows: z.array(
    z.object({
      rowNumber: z.number(),
      fullName: z.string().nullable(),
      employeeNumber: z.string().nullable(),
      departmentName: z.string().nullable(),
      positionName: z.string().nullable(),
      employmentStatus: z.enum(EMPLOYMENT_STATUSES).nullable(),
      joinDate: z.string().nullable(),
      issues: z.array(z.object({ column: z.string(), message: z.string() })),
    }),
  ),
  validCount: z.number(),
  invalidCount: z.number(),
});

export const employeeImportResultSchema: z.ZodType<EmployeeImportResult> = z.object({
  imported: z.number(),
  skipped: z.number(),
});

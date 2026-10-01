import { z } from "zod";

import { DEDUCTION_RULE_VERSION_STATUSES } from "./attendanceDeductions.js";
import { positiveMoneySchema } from "./money.js";
import { PAYROLL_COMPONENT_KINDS } from "./payrollCalculation.js";
import { BPJS_PROGRAMS, JKK_RISK_LEVELS } from "./regulations.js";
import { isoDateSchema } from "./workCalendar.js";

// Komponen gaji (feature 28): katalog komponen per usaha (/settings/salary-components) + gaji karyawan berlaku-tanggal
// (tab Gaji /employees/[id]). Owner/admin saja. Uang = string desimal.

export const SALARY_COMPONENT_NAME_MAX = 80;
export const SALARY_NOTE_MAX = 500;
// Batas wajar jumlah komponen dalam satu versi gaji
export const SALARY_ITEMS_MAX = 30;

// ——— Katalog komponen ———

export const salaryComponentInputSchema = z.object({
  name: z.string("Nama wajib diisi").trim().min(1, "Nama wajib diisi").max(SALARY_COMPONENT_NAME_MAX, `Nama maksimal ${SALARY_COMPONENT_NAME_MAX} karakter`),
  kind: z.enum(PAYROLL_COMPONENT_KINDS, "Pilih jenis komponen"),
});
export type SalaryComponentInput = z.infer<typeof salaryComponentInputSchema>;

export const jkkRiskLevelInputSchema = z.object({
  jkkRiskLevel: z.literal(JKK_RISK_LEVELS, "Pilih kelompok risiko"),
});
export type JkkRiskLevelInput = z.infer<typeof jkkRiskLevelInputSchema>;

export const salaryComponentSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.enum(PAYROLL_COMPONENT_KINDS),
  // Komponen bawaan Exapay (boleh diubah namanya; gaji pokok tidak bisa diarsipkan/dihapus)
  builtin: z.boolean(),
  archived: z.boolean(),
  // Sudah dipakai di versi gaji mana pun → tidak bisa dihapus & jenisnya tidak bisa diubah
  inUse: z.boolean(),
  // Karyawan aktif yang gaji berjalannya memakai komponen ini
  employeeCount: z.number(),
});
export type SalaryComponent = z.infer<typeof salaryComponentSchema>;

export const salaryComponentSettingsSchema = z.object({
  // Urutan tampil (aktif dulu, lalu diarsipkan)
  components: z.array(salaryComponentSchema),
  jkkRiskLevel: z.literal(JKK_RISK_LEVELS),
});
export type SalaryComponentSettings = z.infer<typeof salaryComponentSettingsSchema>;

// ——— Gaji karyawan ———

export const saveEmployeeSalarySchema = z.object({
  // ≥ tanggal masuk karyawan — dicek di API
  effectiveFrom: isoDateSchema,
  items: z
    .array(z.object({ componentId: z.uuid("Komponen tidak valid"), amount: positiveMoneySchema }))
    .min(1, "Isi minimal gaji pokok")
    .max(SALARY_ITEMS_MAX, `Maksimal ${SALARY_ITEMS_MAX} komponen`)
    .refine((items) => new Set(items.map((item) => item.componentId)).size === items.length, "Komponen tidak boleh ganda"),
  bpjsPrograms: z
    .array(z.enum(BPJS_PROGRAMS))
    .refine((programs) => new Set(programs).size === programs.length, "Program BPJS tidak boleh ganda"),
  note: z
    .string()
    .trim()
    .max(SALARY_NOTE_MAX, `Catatan maksimal ${SALARY_NOTE_MAX} karakter`)
    .transform((value) => (value === "" ? null : value))
    .nullable(),
});
export type SaveEmployeeSalaryInput = z.input<typeof saveEmployeeSalarySchema>;
export type SaveEmployeeSalaryData = z.output<typeof saveEmployeeSalarySchema>;

export const employeeSalaryItemSchema = z.object({
  componentId: z.string(),
  name: z.string(),
  kind: z.enum(PAYROLL_COMPONENT_KINDS),
  amount: z.string(),
});
export type EmployeeSalaryItem = z.infer<typeof employeeSalaryItemSchema>;

export const employeeSalaryVersionSchema = z.object({
  id: z.string(),
  effectiveFrom: z.string(),
  effectiveTo: z.string().nullable(),
  // active = berlaku hari ini · scheduled = mulai berlaku nanti · ended = sudah digantikan
  status: z.enum(DEDUCTION_RULE_VERSION_STATUSES),
  // Urutan katalog komponen
  items: z.array(employeeSalaryItemSchema),
  // Jumlah pendapatan (semua jenis selain potongan) & potongan — nominal tercatat, sebelum prorata/BPJS/PPh 21
  earningsTotal: z.string(),
  deductionsTotal: z.string(),
  bpjsPrograms: z.array(z.enum(BPJS_PROGRAMS)),
  note: z.string().nullable(),
  createdByName: z.string().nullable(),
  createdAt: z.string(),
});
export type EmployeeSalaryVersion = z.infer<typeof employeeSalaryVersionSchema>;

export const employeeSalaryOverviewSchema = z.object({
  // Hari ini di zona waktu usaha
  today: z.string(),
  // Batas awal tanggal berlaku
  joinDate: z.string(),
  jkkRiskLevel: z.literal(JKK_RISK_LEVELS),
  // Komponen yang bisa dipilih untuk versi baru (tidak diarsipkan), urutan katalog
  components: z.array(z.object({ id: z.string(), name: z.string(), kind: z.enum(PAYROLL_COMPONENT_KINDS) })),
  // Terbaru di atas (tanggal berlaku menurun)
  versions: z.array(employeeSalaryVersionSchema),
});
export type EmployeeSalaryOverview = z.infer<typeof employeeSalaryOverviewSchema>;

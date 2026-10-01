import { z } from "zod";

import { attendanceMonthSchema } from "./attendance.js";
import { attendanceDeductionFactsSchema, attendanceDeductionRulesSchema } from "./attendanceDeductions.js";
import { PTKP_STATUSES } from "./employees.js";
import { moneySchema, positiveMoneySchema } from "./money.js";
import { PAYROLL_COMPONENT_KINDS, payrollCalculationResultSchema } from "./payrollCalculation.js";
import { pph21ResultSchema } from "./pph21.js";
import { BPJS_PROGRAMS } from "./regulations.js";

// Run payroll — draf & review (feature 29): satu periode = satu bulan kalender per usaha (/payroll, /payroll/[id]).
// Angka draf dihitung saat dibaca oleh payroll-engine dari gaji berlaku, absensi, aturan potongan, regulasi, dan
// penyesuaian admin. Finalisasi (feature 30) menyimpan snapshot immutable — periode final dibaca dari snapshot, tidak
// pernah dihitung ulang; koreksi lewat penyesuaian periode berikutnya. Owner/admin saja. Uang = string desimal.

export const PAYROLL_RUN_STATUSES = ["draft", "final"] as const;
export type PayrollRunStatus = (typeof PAYROLL_RUN_STATUSES)[number];

// Penyesuaian admin per karyawan di draf:
// - add_line: pendapatan tidak tetap (THR, bonus) atau potongan (kasbon) tambahan periode ini
// - override_component: nominal komponen gaji diganti untuk periode ini saja (nominal sebulan, sebelum prorata)
// - waive_attendance: potongan absensi & pengurangan tunjangan kehadiran dibatalkan (prorata masa kerja tetap)
// - exclude: karyawan tidak ikut periode ini (mis. dibayar terpisah)
export const PAYROLL_ADJUSTMENT_KINDS = ["add_line", "override_component", "waive_attendance", "exclude"] as const;
export type PayrollAdjustmentKind = (typeof PAYROLL_ADJUSTMENT_KINDS)[number];
export const PAYROLL_ADJUSTMENT_LINE_KINDS = ["variable_allowance", "deduction"] as const;
export type PayrollAdjustmentLineKind = (typeof PAYROLL_ADJUSTMENT_LINE_KINDS)[number];

export const PAYROLL_ADJUSTMENT_NAME_MAX = 80;
export const PAYROLL_ADJUSTMENT_REASON_MAX = 500;

// Status baris karyawan di draf
// calculated = dihitung · excluded = dikeluarkan admin · no_salary = gaji belum diatur untuk periode ini ·
// error = tidak bisa dihitung (mis. data regulasi belum tersedia)
export const PAYROLL_EMPLOYEE_STATUSES = ["calculated", "excluded", "no_salary", "error"] as const;
export type PayrollEmployeeStatus = (typeof PAYROLL_EMPLOYEE_STATUSES)[number];

// ——— Input ———

export const openPayrollRunSchema = z.object({
  month: attendanceMonthSchema,
});
export type OpenPayrollRunInput = z.infer<typeof openPayrollRunSchema>;

// Finalisasi: `fingerprint` = sidik draf yang direview (dari detail) — draf berubah sejak dibuka → 409
export const finalizePayrollRunSchema = z.object({
  fingerprint: z.string("Muat ulang halaman lalu coba lagi").regex(/^[0-9a-f]{64}$/, "Muat ulang halaman lalu coba lagi"),
});
export type FinalizePayrollRunInput = z.infer<typeof finalizePayrollRunSchema>;

const reasonSchema = z
  .string("Alasan wajib diisi")
  .trim()
  .min(1, "Alasan wajib diisi")
  .max(PAYROLL_ADJUSTMENT_REASON_MAX, `Alasan maksimal ${PAYROLL_ADJUSTMENT_REASON_MAX} karakter`);

export const payrollAdjustmentInputSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("add_line"),
    lineKind: z.enum(PAYROLL_ADJUSTMENT_LINE_KINDS, "Pilih jenis"),
    name: z
      .string("Keterangan wajib diisi")
      .trim()
      .min(1, "Keterangan wajib diisi")
      .max(PAYROLL_ADJUSTMENT_NAME_MAX, `Keterangan maksimal ${PAYROLL_ADJUSTMENT_NAME_MAX} karakter`),
    amount: positiveMoneySchema,
  }),
  // Nominal 0 = komponen tidak dibayar periode ini (gaji pokok tetap wajib > 0 — dicek API)
  z.object({ kind: z.literal("override_component"), componentId: z.uuid("Pilih komponen"), amount: moneySchema, reason: reasonSchema }),
  z.object({ kind: z.literal("waive_attendance"), reason: reasonSchema }),
  z.object({ kind: z.literal("exclude"), reason: reasonSchema }),
]);
export type PayrollAdjustmentInput = z.infer<typeof payrollAdjustmentInputSchema>;

// ——— Output ———

export const payrollRunPeriodSchema = z.object({
  id: z.string(),
  // "2026-10"
  month: z.string(),
  // Rentang absensi periode (tutup buku, feature 30b): final = tersimpan, draf = pengaturan usaha saat ini
  periodStart: z.string(),
  periodEnd: z.string(),
  // Tanggal gajian dari profil usaha (hari terakhir bulan bila bulan lebih pendek); null = belum diatur
  payDate: z.string().nullable(),
  status: z.enum(PAYROLL_RUN_STATUSES),
  createdByName: z.string().nullable(),
  createdAt: z.string(),
  // Terisi bila status final
  finalizedAt: z.string().nullable(),
  finalizedByName: z.string().nullable(),
});
export type PayrollRunPeriod = z.infer<typeof payrollRunPeriodSchema>;

export const payrollRunListSchema = z.object({
  // Hari ini di zona waktu usaha
  today: z.string(),
  // Bulan yang bisa dibuka (belum punya periode): bulan payroll berjalan (tutup buku) s.d. 12 bulan ke belakang, terbaru dulu
  openableMonths: z.array(z.string()),
  // Terbaru dulu
  runs: z.array(payrollRunPeriodSchema.extend({ adjustmentCount: z.number().int() })),
});
export type PayrollRunList = z.infer<typeof payrollRunListSchema>;

export const payrollRunEmployeeSchema = z.object({
  id: z.string(),
  fullName: z.string(),
  employeeNumber: z.string().nullable(),
  positionName: z.string(),
  departmentName: z.string(),
  // Masa kerja — label Masuk/Keluar bila jatuh di dalam periode (feature 30b)
  joinDate: z.string(),
  endDate: z.string().nullable(),
});
export type PayrollRunEmployee = z.infer<typeof payrollRunEmployeeSchema>;

export const payrollRunTotalsSchema = z.object({
  // Karyawan yang dihitung
  employeeCount: z.number().int(),
  grossPay: z.string(),
  bpjsEmployer: z.string(),
  bpjsEmployee: z.string(),
  pph21: z.string(),
  // Gaji diterima = gaji bersih − PPh 21
  takeHomePay: z.string(),
});
export type PayrollRunTotals = z.infer<typeof payrollRunTotalsSchema>;

export const payrollRunRowSchema = z.object({
  employee: payrollRunEmployeeSchema,
  status: z.enum(PAYROLL_EMPLOYEE_STATUSES),
  // Alasan dikeluarkan / pesan gagal hitung
  message: z.string().nullable(),
  // Terisi hanya untuk status calculated
  grossPay: z.string().nullable(),
  // Iuran BPJS karyawan + potongan lain
  totalDeductions: z.string().nullable(),
  pph21: z.string().nullable(),
  takeHomePay: z.string().nullable(),
  warningCount: z.number().int(),
  adjustmentCount: z.number().int(),
});
export type PayrollRunRow = z.infer<typeof payrollRunRowSchema>;

// Kesiapan finalisasi periode draf (keputusan user feature 30): periode sudah berakhir, semua karyawan terhitung atau
// dikeluarkan, dan periode sebelumnya yang sudah dibuka sudah final.
export const payrollRunFinalizationSchema = z.object({
  // Kosong = siap difinalisasi
  blockers: z.array(z.string()),
  // Sidik draf yang ditampilkan — dikirim balik saat finalisasi
  fingerprint: z.string(),
});
export type PayrollRunFinalization = z.infer<typeof payrollRunFinalizationSchema>;

export const payrollRunDetailSchema = payrollRunPeriodSchema.extend({
  today: z.string(),
  // Periode belum berakhir → absensi baru dihitung s.d. kemarin
  periodEnded: z.boolean(),
  // Peringatan tingkat periode (periode belum berakhir, aturan potongan berubah di tengah periode, regulasi belum ada);
  // periode final: peringatan saat finalisasi
  warnings: z.array(z.string()),
  totals: payrollRunTotalsSchema,
  // Urut nama
  rows: z.array(payrollRunRowSchema),
  // null untuk periode final
  finalization: payrollRunFinalizationSchema.nullable(),
});
export type PayrollRunDetail = z.infer<typeof payrollRunDetailSchema>;

export const payrollAdjustmentSchema = z.object({
  id: z.string(),
  kind: z.enum(PAYROLL_ADJUSTMENT_KINDS),
  lineKind: z.enum(PAYROLL_ADJUSTMENT_LINE_KINDS).nullable(),
  name: z.string().nullable(),
  componentId: z.string().nullable(),
  componentName: z.string().nullable(),
  amount: z.string().nullable(),
  reason: z.string().nullable(),
  createdByName: z.string().nullable(),
  createdAt: z.string(),
});
export type PayrollAdjustment = z.infer<typeof payrollAdjustmentSchema>;

export const payrollSalaryItemSchema = z.object({
  componentId: z.string(),
  name: z.string(),
  kind: z.enum(PAYROLL_COMPONENT_KINDS),
  // Nominal di versi gaji (sebelum penyesuaian)
  amount: z.string(),
});
export type PayrollSalaryItem = z.infer<typeof payrollSalaryItemSchema>;

export const payrollEmployeeDetailSchema = z.object({
  run: payrollRunPeriodSchema.extend({ periodEnded: z.boolean() }),
  employee: payrollRunEmployeeSchema.extend({
    ptkpStatus: z.enum(PTKP_STATUSES),
  }),
  status: z.enum(PAYROLL_EMPLOYEE_STATUSES),
  message: z.string().nullable(),
  // Versi gaji yang dipakai (berlaku di hari terakhir periode / hari terakhir bekerja); null = belum diatur
  salary: z
    .object({
      effectiveFrom: z.string(),
      effectiveTo: z.string().nullable(),
      items: z.array(payrollSalaryItemSchema),
      bpjsPrograms: z.array(z.enum(BPJS_PROGRAMS)),
    })
    .nullable(),
  adjustments: z.array(payrollAdjustmentSchema),
  // Fakta absensi periode (dasar prorata & potongan); null bila tidak dihitung
  attendanceFacts: attendanceDeductionFactsSchema.nullable(),
  attendanceWaived: z.boolean(),
  result: payrollCalculationResultSchema.nullable(),
  pph21: pph21ResultSchema.nullable(),
  takeHomePay: z.string().nullable(),
  // Peringatan draf + payroll-engine + PPh 21
  warnings: z.array(z.string()),
});
export type PayrollEmployeeDetail = z.infer<typeof payrollEmployeeDetailSchema>;

// ——— Snapshot final (feature 30) ———

// Per karyawan (payroll_run_employees.snapshot): rincian seperti detail draf saat final, tanpa data periode.
// `warnings` = peringatan karyawan saja (peringatan periode di PayrollRunSnapshot, digabung saat dibaca)
export const payrollEmployeeSnapshotSchema = payrollEmployeeDetailSchema.omit({ run: true }).extend({
  status: z.enum(["calculated", "excluded"]),
});
export type PayrollEmployeeSnapshot = z.infer<typeof payrollEmployeeSnapshotSchema>;

// Per periode (payroll_runs.snapshot): total, peringatan, dan masukan bersama yang dipakai saat final (versi aturan)
export const payrollRunSnapshotSchema = z.object({
  version: z.literal(1),
  // Hari ini (zona waktu usaha) saat final
  finalizedOn: z.string(),
  payDate: z.string().nullable(),
  warnings: z.array(z.string()),
  totals: payrollRunTotalsSchema,
  inputs: z.object({
    timeZone: z.string(),
    regencyCode: z.string().nullable(),
    minimumWage: z.string().nullable(),
    jkkRiskLevel: z.number().int(),
    // Tanggal tutup buku saat final (feature 30b; snapshot sebelumnya tanpa isian = akhir bulan)
    attendanceCutoffDay: z.number().int().nullable().default(null),
    // Aturan potongan absensi versi hari pertama periode + tanggal versi baru di tengah periode
    attendanceRules: attendanceDeductionRulesSchema,
    attendanceRulesChangedOn: z.string().nullable(),
    // PayrollRegulations (tarif BPJS, TER, Pasal 17, PTKP, biaya jabatan + sumber & tanggal berlaku) apa adanya
    regulations: z.unknown(),
  }),
});
export type PayrollRunSnapshot = z.infer<typeof payrollRunSnapshotSchema>;

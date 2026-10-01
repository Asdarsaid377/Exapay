import { z } from "zod";

import { attendanceDeductionResultSchema } from "./attendanceDeductions.js";
import { BPJS_PROGRAMS, JKK_RISK_LEVELS } from "./regulations.js";

// Hasil perhitungan gaji satu karyawan satu periode oleh payroll-engine: komponen & BPJS (feature 25),
// prorata masa kerja & potongan absensi (feature 27). PPh 21 (feature 26) dihitung di atas hasil ini. Uang = string desimal.
// Zod schema agar rincian draf payroll (feature 29) bisa divalidasi di web.

// Jenis komponen gaji:
// - base_salary: gaji pokok (tepat satu)
// - fixed_allowance: tunjangan tetap — dibayar tetap tiap bulan, ikut dasar upah BPJS
// - variable_allowance: tunjangan/pendapatan tidak tetap (mis. THR, insentif) — tidak ikut dasar upah BPJS
// - attendance_allowance: tunjangan kehadiran (paling banyak satu) — tidak tetap (tidak ikut BPJS), bisa hangus/berkurang
//   menurut aturan potongan absensi
// - deduction: potongan lain (mis. kasbon) — mengurangi gaji bersih, tidak memengaruhi BPJS
export const PAYROLL_COMPONENT_KINDS = ["base_salary", "fixed_allowance", "variable_allowance", "attendance_allowance", "deduction"] as const;
export type PayrollComponentKind = (typeof PAYROLL_COMPONENT_KINDS)[number];

export const payrollComponentLineSchema = z.object({
  code: z.string(),
  name: z.string(),
  kind: z.enum(PAYROLL_COMPONENT_KINDS),
  amount: z.string(),
});
export type PayrollComponentLine = z.infer<typeof payrollComponentLineSchema>;

// Iuran satu program BPJS: dasar iuran (setelah batas bawah/atas) × tarif, porsi perusahaan & karyawan
export const bpjsContributionLineSchema = z.object({
  program: z.enum(BPJS_PROGRAMS),
  jkkRiskLevel: z.literal(JKK_RISK_LEVELS).nullable(),
  contributionBase: z.string(),
  employerRatePercent: z.string(),
  employeeRatePercent: z.string(),
  employerAmount: z.string(),
  employeeAmount: z.string(),
  steps: z.array(z.string()),
});
export type BpjsContributionLine = z.infer<typeof bpjsContributionLineSchema>;

// Prorata gaji pokok & tunjangan tetap untuk karyawan yang masuk/keluar di tengah periode
export const payrollProrationSchema = z.object({
  periodWorkingDays: z.number().int(),
  employedWorkingDays: z.number().int(),
  steps: z.array(z.string()),
});
export type PayrollProration = z.infer<typeof payrollProrationSchema>;

export const payrollCalculationResultSchema = z.object({
  // Komponen pendapatan sebesar yang dibayar periode ini (gaji pokok & tunjangan tetap setelah prorata;
  // tunjangan kehadiran sebesar nominal — pengurangannya di `attendance`)
  earnings: z.array(payrollComponentLineSchema),
  deductions: z.array(payrollComponentLineSchema),
  // null = bekerja sepanjang periode (tidak diprorata)
  proration: payrollProrationSchema.nullable(),
  baseSalary: z.string(),
  fixedAllowances: z.string(),
  variableAllowances: z.string(),
  // Tunjangan kehadiran: nominal & yang dibayar setelah aturan absensi
  attendanceAllowance: z.string(),
  attendanceAllowancePaid: z.string(),
  // Potongan absensi (alpa, izin/sakit, telat); null = tanpa data absensi
  attendance: attendanceDeductionResultSchema.nullable(),
  attendanceDeductionTotal: z.string(),
  // Pendapatan bruto = gaji pokok + tunjangan tetap + tunjangan tidak tetap + tunjangan kehadiran dibayar − potongan absensi.
  // Dasar bruto PPh 21 (potongan absensi mengurangi penghasilan yang diterima)
  grossPay: z.string(),
  // Upah dasar BPJS sebelum batas: gaji pokok + tunjangan tetap sebulan penuh — tidak dikurangi prorata/potongan absensi
  bpjsWage: z.string(),
  bpjs: z.array(bpjsContributionLineSchema),
  bpjsEmployerTotal: z.string(),
  bpjsEmployeeTotal: z.string(),
  otherDeductionsTotal: z.string(),
  // Iuran BPJS porsi karyawan + potongan lain
  totalDeductions: z.string(),
  // Gaji bersih sebelum PPh 21: pendapatan bruto − potongan
  netPay: z.string(),
  steps: z.array(z.string()),
  // Hal yang perlu diperhatikan admin (mis. data upah minimum tidak tersedia); tidak menghentikan perhitungan
  warnings: z.array(z.string()),
});
export type PayrollCalculationResult = z.infer<typeof payrollCalculationResultSchema>;

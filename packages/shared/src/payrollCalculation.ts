import type { BpjsProgram, JkkRiskLevel } from "./regulations.js";

// Hasil perhitungan gaji satu karyawan satu periode oleh payroll-engine (feature 25: komponen & BPJS).
// PPh 21 (feature 26) dan potongan absensi (feature 27) menyusul di atas hasil ini. Uang = string desimal.

// Jenis komponen gaji:
// - base_salary: gaji pokok (tepat satu)
// - fixed_allowance: tunjangan tetap — dibayar tetap tiap bulan, ikut dasar upah BPJS
// - variable_allowance: tunjangan/pendapatan tidak tetap (mis. THR, insentif) — tidak ikut dasar upah BPJS
// - deduction: potongan lain (mis. kasbon) — mengurangi gaji bersih, tidak memengaruhi BPJS
export const PAYROLL_COMPONENT_KINDS = ["base_salary", "fixed_allowance", "variable_allowance", "deduction"] as const;
export type PayrollComponentKind = (typeof PAYROLL_COMPONENT_KINDS)[number];

export type PayrollComponentLine = {
  code: string;
  name: string;
  kind: PayrollComponentKind;
  amount: string;
};

// Iuran satu program BPJS: dasar iuran (setelah batas bawah/atas) × tarif, porsi perusahaan & karyawan
export type BpjsContributionLine = {
  program: BpjsProgram;
  jkkRiskLevel: JkkRiskLevel | null;
  contributionBase: string;
  employerRatePercent: string;
  employeeRatePercent: string;
  employerAmount: string;
  employeeAmount: string;
  steps: string[];
};

export type PayrollCalculationResult = {
  earnings: PayrollComponentLine[];
  deductions: PayrollComponentLine[];
  baseSalary: string;
  fixedAllowances: string;
  variableAllowances: string;
  // Total pendapatan (gaji pokok + semua tunjangan)
  grossPay: string;
  // Upah dasar BPJS sebelum batas: gaji pokok + tunjangan tetap
  bpjsWage: string;
  bpjs: BpjsContributionLine[];
  bpjsEmployerTotal: string;
  bpjsEmployeeTotal: string;
  otherDeductionsTotal: string;
  // Iuran BPJS porsi karyawan + potongan lain
  totalDeductions: string;
  // Gaji bersih sebelum PPh 21 & potongan absensi
  netPay: string;
  steps: string[];
  // Hal yang perlu diperhatikan admin (mis. data upah minimum tidak tersedia); tidak menghentikan perhitungan
  warnings: string[];
};

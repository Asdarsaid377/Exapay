import type { AttendanceDeductionResult } from "./attendanceDeductions.js";
import type { BpjsProgram, JkkRiskLevel } from "./regulations.js";

// Hasil perhitungan gaji satu karyawan satu periode oleh payroll-engine: komponen & BPJS (feature 25),
// prorata masa kerja & potongan absensi (feature 27). PPh 21 (feature 26) dihitung di atas hasil ini. Uang = string desimal.

// Jenis komponen gaji:
// - base_salary: gaji pokok (tepat satu)
// - fixed_allowance: tunjangan tetap — dibayar tetap tiap bulan, ikut dasar upah BPJS
// - variable_allowance: tunjangan/pendapatan tidak tetap (mis. THR, insentif) — tidak ikut dasar upah BPJS
// - attendance_allowance: tunjangan kehadiran (paling banyak satu) — tidak tetap (tidak ikut BPJS), bisa hangus/berkurang
//   menurut aturan potongan absensi
// - deduction: potongan lain (mis. kasbon) — mengurangi gaji bersih, tidak memengaruhi BPJS
export const PAYROLL_COMPONENT_KINDS = ["base_salary", "fixed_allowance", "variable_allowance", "attendance_allowance", "deduction"] as const;
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

// Prorata gaji pokok & tunjangan tetap untuk karyawan yang masuk/keluar di tengah periode
export type PayrollProration = {
  periodWorkingDays: number;
  employedWorkingDays: number;
  steps: string[];
};

export type PayrollCalculationResult = {
  // Komponen pendapatan sebesar yang dibayar periode ini (gaji pokok & tunjangan tetap setelah prorata;
  // tunjangan kehadiran sebesar nominal — pengurangannya di `attendance`)
  earnings: PayrollComponentLine[];
  deductions: PayrollComponentLine[];
  // null = bekerja sepanjang periode (tidak diprorata)
  proration: PayrollProration | null;
  baseSalary: string;
  fixedAllowances: string;
  variableAllowances: string;
  // Tunjangan kehadiran: nominal & yang dibayar setelah aturan absensi
  attendanceAllowance: string;
  attendanceAllowancePaid: string;
  // Potongan absensi (alpa, izin/sakit, telat); null = tanpa data absensi
  attendance: AttendanceDeductionResult | null;
  attendanceDeductionTotal: string;
  // Pendapatan bruto = gaji pokok + tunjangan tetap + tunjangan tidak tetap + tunjangan kehadiran dibayar − potongan absensi.
  // Dasar bruto PPh 21 (potongan absensi mengurangi penghasilan yang diterima)
  grossPay: string;
  // Upah dasar BPJS sebelum batas: gaji pokok + tunjangan tetap sebulan penuh — tidak dikurangi prorata/potongan absensi
  bpjsWage: string;
  bpjs: BpjsContributionLine[];
  bpjsEmployerTotal: string;
  bpjsEmployeeTotal: string;
  otherDeductionsTotal: string;
  // Iuran BPJS porsi karyawan + potongan lain
  totalDeductions: string;
  // Gaji bersih sebelum PPh 21: pendapatan bruto − potongan
  netPay: string;
  steps: string[];
  // Hal yang perlu diperhatikan admin (mis. data upah minimum tidak tersedia); tidak menghentikan perhitungan
  warnings: string[];
};

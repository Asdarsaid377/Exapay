import type { BpjsProgram, EmployeeSalaryVersion, JkkRiskLevel, PayrollComponentKind } from "@exapay/shared";

// Label komponen gaji & BPJS (feature 28) — /settings/salary-components dan tab Gaji /employees/[id]

export const COMPONENT_KIND_LABELS: Record<PayrollComponentKind, string> = {
  base_salary: "Gaji pokok",
  fixed_allowance: "Tunjangan tetap",
  variable_allowance: "Tunjangan tidak tetap",
  attendance_allowance: "Tunjangan kehadiran",
  deduction: "Potongan",
};

// Penjelasan perlakuan tiap jenis di perhitungan gaji (payroll-engine)
export const COMPONENT_KIND_DESCRIPTIONS: Record<PayrollComponentKind, string> = {
  base_salary: "Upah pokok bulanan. Ikut dasar iuran BPJS dan dihitung prorata untuk karyawan yang masuk/keluar di tengah bulan.",
  fixed_allowance: "Dibayar tetap tiap bulan tanpa melihat kehadiran (mis. tunjangan jabatan). Ikut dasar iuran BPJS dan prorata.",
  variable_allowance: "Bisa berubah atau bergantung kehadiran (mis. uang makan, insentif, THR). Tidak ikut dasar iuran BPJS.",
  attendance_allowance: "Hangus atau berkurang menurut aturan potongan absensi. Tidak ikut dasar iuran BPJS. Satu per usaha.",
  deduction: "Mengurangi gaji bersih (mis. cicilan pinjaman). Tidak memengaruhi BPJS dan pajak.",
};

// Urutan pilihan di form
export const COMPONENT_KIND_OPTIONS: readonly PayrollComponentKind[] = ["fixed_allowance", "variable_allowance", "attendance_allowance", "deduction", "base_salary"];

export const BPJS_PROGRAM_LABELS: Record<BpjsProgram, string> = {
  kesehatan: "BPJS Kesehatan",
  jht: "Jaminan Hari Tua (JHT)",
  jp: "Jaminan Pensiun (JP)",
  jkk: "Jaminan Kecelakaan Kerja (JKK)",
  jkm: "Jaminan Kematian (JKM)",
};

export const BPJS_PROGRAM_SHORT_LABELS: Record<BpjsProgram, string> = {
  kesehatan: "Kesehatan",
  jht: "JHT",
  jp: "JP",
  jkk: "JKK",
  jkm: "JKM",
};

// Kelompok risiko JKK (PP 44/2015); tarifnya dari data regulasi, tidak ditulis di sini
export const JKK_RISK_LABELS: Record<JkkRiskLevel, string> = {
  1: "Kelompok 1 — sangat rendah (kantor, toko, jasa)",
  2: "Kelompok 2 — rendah",
  3: "Kelompok 3 — sedang",
  4: "Kelompok 4 — tinggi",
  5: "Kelompok 5 — sangat tinggi",
};

// Versi yang ditampilkan sebagai "gaji saat ini": yang berlaku hari ini, selain itu yang paling dekat terjadwal
export function currentSalaryVersion(versions: readonly EmployeeSalaryVersion[]): EmployeeSalaryVersion | null {
  return versions.find((version) => version.status === "active") ?? versions.findLast((version) => version.status === "scheduled") ?? null;
}

export function bpjsSummary(programs: readonly BpjsProgram[]): string {
  return programs.length === 0 ? "Tidak ikut BPJS" : programs.map((program) => BPJS_PROGRAM_SHORT_LABELS[program]).join(", ");
}

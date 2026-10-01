import type { PtkpStatus } from "./employees.js";

// Data regulasi berlaku-tanggal (feature 24): data referensi platform, diisi lewat migration (bukan input tenant).
// Setiap versi punya effective_from/effective_to (inklusif; null = tanpa batas atas) dan sumber resmi.
// Uang & tarif dikirim sebagai string desimal (numeric Postgres) — tidak pernah number. Tarif dalam persen ("3.7000" = 3,7%).
// Dipakai payroll-engine (feature 25–26) dan peringatan UMK (feature 34).

// Program BPJS: Kesehatan + Ketenagakerjaan (JHT, JP, JKK per kelompok risiko, JKM)
export const BPJS_PROGRAMS = ["kesehatan", "jht", "jp", "jkk", "jkm"] as const;
export type BpjsProgram = (typeof BPJS_PROGRAMS)[number];
// Kelompok risiko JKK (PP 44/2015): 1 sangat rendah · 2 rendah · 3 sedang · 4 tinggi · 5 sangat tinggi
export const JKK_RISK_LEVELS = [1, 2, 3, 4, 5] as const;
export type JkkRiskLevel = (typeof JKK_RISK_LEVELS)[number];

// Tabel tarif pajak berlapis: TER bulanan kategori A/B/C (PP 58/2023) dan tarif progresif Pasal 17 tahunan (UU HPP)
export const TAX_RATE_KINDS = ["ter_a", "ter_b", "ter_c", "pasal_17"] as const;
export type TaxRateKind = (typeof TAX_RATE_KINDS)[number];
export const TER_KINDS = ["ter_a", "ter_b", "ter_c"] as const;
export type TerKind = (typeof TER_KINDS)[number];

export type RegulationVersion = {
  effectiveFrom: string;
  effectiveTo: string | null;
  source: string;
};

export type BpjsRate = RegulationVersion & {
  program: BpjsProgram;
  // Hanya untuk program jkk
  jkkRiskLevel: JkkRiskLevel | null;
  employerRatePercent: string;
  employeeRatePercent: string;
  // Batas atas upah dasar iuran per bulan; null = tanpa batas
  wageCap: string | null;
};

// Lapis tarif. TER: tarif flat untuk penghasilan bruto bulanan ≤ incomeUpTo. Pasal 17: tarif marginal lapis
// penghasilan kena pajak setahun. Lapis diurutkan naik; lapis terakhir incomeUpTo = null (tanpa batas).
export type TaxBracket = {
  incomeUpTo: string | null;
  ratePercent: string;
};

export type TaxRateTable = RegulationVersion & {
  kind: TaxRateKind;
  brackets: TaxBracket[];
};

export type PtkpRate = RegulationVersion & {
  status: PtkpStatus;
  annualAmount: string;
  // Kategori TER untuk status PTKP ini (PP 58/2023)
  terKind: TerKind;
};

// Parameter PPh 21 lain: biaya jabatan (PMK 168/2023)
export type Pph21Parameters = RegulationVersion & {
  occupationalCostRatePercent: string;
  occupationalCostMonthlyMax: string;
  occupationalCostAnnualMax: string;
};

// Semua aturan payroll yang berlaku pada satu tanggal
export type PayrollRegulations = {
  date: string;
  bpjs: BpjsRate[];
  taxTables: TaxRateTable[];
  ptkp: PtkpRate[];
  pph21: Pph21Parameters;
};

// Upah minimum: UMK kota/kabupaten, atau UMP provinsi bila kota tidak menetapkan UMK / belum ada datanya
export type MinimumWage = RegulationVersion & {
  scope: "regency" | "province";
  areaCode: string;
  monthlyAmount: string;
};

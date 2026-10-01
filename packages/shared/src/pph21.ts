import type { PtkpStatus } from "./employees.js";
import type { TerKind } from "./regulations.js";

// PPh 21 pegawai tetap (feature 26) — PP 58/2023 & PMK 168/2023. Uang = string desimal.
// - Masa biasa: penghasilan bruto sebulan × TER bulanan kategori PTKP.
// - Masa pajak terakhir (Desember, atau bulan terakhir bekerja): tarif Pasal 17 atas penghasilan kena pajak setahun,
//   dikurangi PPh 21 yang sudah dipotong di masa sebelumnya. Hasil bisa negatif = kelebihan potong dikembalikan ke pegawai.

// Ringkasan satu masa di tahun pajak yang sama pada pemberi kerja ini — diambil dari snapshot payroll final
export type Pph21PeriodRecord = {
  // Masa pajak 1–12
  month: number;
  // Penghasilan bruto masa itu (gaji + semua tunjangan + premi JKK/JKM/BPJS Kesehatan yang dibayar pemberi kerja)
  grossIncome: string;
  // Iuran JHT + JP yang dibayar sendiri oleh pegawai (pengurang di masa pajak terakhir)
  pensionContribution: string;
  // Zakat / sumbangan keagamaan wajib yang dibayar melalui pemberi kerja
  religiousContribution: string;
  pph21Withheld: string;
};

// Bukti potong pemberi kerja sebelumnya di tahun pajak yang sama (pegawai pindah kerja tengah tahun)
export type Pph21PreviousEmployer = {
  netIncome: string;
  pph21Withheld: string;
};

// Rincian penghitungan setahun pada masa pajak terakhir
export type Pph21AnnualCalculation = {
  monthsWorked: number;
  grossIncome: string;
  occupationalCost: string;
  pensionContribution: string;
  religiousContribution: string;
  // Penghasilan neto di pemberi kerja ini
  netIncome: string;
  previousEmployerNetIncome: string;
  ptkp: string;
  // Dibulatkan ke bawah ribuan penuh; tidak negatif
  taxableIncome: string;
  annualTax: string;
  // PPh 21 yang sudah dipotong masa sebelumnya di pemberi kerja ini
  withheldThisEmployer: string;
  withheldPreviousEmployer: string;
};

export type Pph21Result = {
  method: "ter" | "annual";
  ptkpStatus: PtkpStatus;
  terKind: TerKind;
  grossIncome: string;
  // Hanya untuk method "ter"
  terRatePercent: string | null;
  annual: Pph21AnnualCalculation | null;
  // PPh 21 masa ini; negatif = kelebihan potong yang dikembalikan ke pegawai
  pph21: string;
  steps: string[];
  warnings: string[];
};

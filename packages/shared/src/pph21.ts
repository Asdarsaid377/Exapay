import { z } from "zod";

import { PTKP_STATUSES } from "./employees.js";
import { TER_KINDS } from "./regulations.js";

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
export const pph21AnnualCalculationSchema = z.object({
  monthsWorked: z.number().int(),
  grossIncome: z.string(),
  occupationalCost: z.string(),
  pensionContribution: z.string(),
  religiousContribution: z.string(),
  // Penghasilan neto di pemberi kerja ini
  netIncome: z.string(),
  previousEmployerNetIncome: z.string(),
  ptkp: z.string(),
  // Dibulatkan ke bawah ribuan penuh; tidak negatif
  taxableIncome: z.string(),
  annualTax: z.string(),
  // PPh 21 yang sudah dipotong masa sebelumnya di pemberi kerja ini
  withheldThisEmployer: z.string(),
  withheldPreviousEmployer: z.string(),
});
export type Pph21AnnualCalculation = z.infer<typeof pph21AnnualCalculationSchema>;

export const pph21ResultSchema = z.object({
  method: z.enum(["ter", "annual"]),
  ptkpStatus: z.enum(PTKP_STATUSES),
  terKind: z.enum(TER_KINDS),
  grossIncome: z.string(),
  // Hanya untuk method "ter"
  terRatePercent: z.string().nullable(),
  annual: pph21AnnualCalculationSchema.nullable(),
  // PPh 21 masa ini; negatif = kelebihan potong yang dikembalikan ke pegawai
  pph21: z.string(),
  steps: z.array(z.string()),
  warnings: z.array(z.string()),
});
export type Pph21Result = z.infer<typeof pph21ResultSchema>;

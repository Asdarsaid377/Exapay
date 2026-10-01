import { z } from "zod";

import { payrollRunTotalsSchema } from "./payrollRuns.js";

// Laporan & ekspor payroll (feature 32): rekap per periode final dalam satu tahun (/payroll/reports) + ekspor Excel per
// periode — daftar transfer bank (semua + sheet per bank) & rekap setor (BPJS per program, PPh 21). Angka hanya dari
// snapshot final (payroll_run_employees, karyawan dihitung) — sama dengan jumlah slip. Owner/admin saja.

export const payrollReportYearSchema = z.coerce.number("Tahun tidak valid").int("Tahun tidak valid").min(2000, "Tahun tidak valid").max(2100, "Tahun tidak valid");

export const payrollReportMonthSchema = z.object({
  runId: z.string(),
  // "2026-10"
  month: z.string(),
  periodStart: z.string(),
  periodEnd: z.string(),
  payDate: z.string().nullable(),
  finalizedAt: z.string(),
  // Karyawan dihitung (= jumlah slip)
  totals: payrollRunTotalsSchema,
});
export type PayrollReportMonth = z.infer<typeof payrollReportMonthSchema>;

export const payrollReportSchema = z.object({
  year: z.number().int(),
  // Tahun yang punya periode final, terbaru dulu (selalu memuat tahun yang diminta)
  years: z.array(z.number().int()),
  // Periode final tahun ini, urut bulan
  months: z.array(payrollReportMonthSchema),
  // Jumlah semua periode final tahun ini; employeeCount = jumlah slip
  totals: payrollRunTotalsSchema,
});
export type PayrollReport = z.infer<typeof payrollReportSchema>;

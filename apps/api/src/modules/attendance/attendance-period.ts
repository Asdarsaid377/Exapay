import { monthRange } from "./attendance-clock.js";

// Periode absensi payroll dengan tanggal tutup buku (feature 30b) — fungsi murni. Keputusan user: tutup buku per usaha
// (1–28, null = akhir bulan). Periode bulan M = hari setelah tutup buku bulan M−1 s.d. tutup buku bulan M; absensi,
// potongan, dan prorata masuk/keluar mengikuti rentang ini, gaji tetap sebulan, PPh 21 masa & BPJS tetap bulan M.

export type PeriodRange = { from: string; to: string };

const DAY_MS = 86_400_000;

function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

// "2026-10", −1 → "2026-09"
export function shiftMonth(month: string, delta: number): string {
  const index = Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7)) - 1 + delta;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
}

// Rentang baku: tutup buku 25 → bulan Oktober = 26 Sep – 25 Okt; tanpa tutup buku = bulan kalender
export function cutoffRange(month: string, cutoffDay: number | null): PeriodRange {
  if (cutoffDay === null) return monthRange(month);
  const day = (value: number) => String(value).padStart(2, "0");
  return { from: addDays(`${shiftMonth(month, -1)}-${day(cutoffDay)}`, 1), to: `${month}-${day(cutoffDay)}` };
}

// Bulan payroll yang rentang bakunya memuat tanggal ini (mis. 26 Sep dengan tutup buku 25 → Oktober)
export function payrollMonthOf(date: string, cutoffDay: number | null): string {
  const month = date.slice(0, 7);
  return cutoffDay !== null && Number(date.slice(8, 10)) > cutoffDay ? shiftMonth(month, 1) : month;
}

// Rentang periode bulan `month`. Bila bulan sebelumnya sudah final, periode dimulai sehari setelah akhir periode final itu
// (tutup buku diubah → periode peralihan lebih panjang/pendek) — tidak ada hari absensi yang terlewat atau dihitung dua kali.
export function payrollPeriodRange(
  month: string,
  cutoffDay: number | null,
  previousFinal: { month: string; periodEnd: string } | null,
): PeriodRange & { transition: boolean } {
  const base = cutoffRange(month, cutoffDay);
  if (!previousFinal || previousFinal.month !== shiftMonth(month, -1)) return { ...base, transition: false };
  const from = addDays(previousFinal.periodEnd, 1);
  // Akhir periode final bulan lalu selalu sebelum tanggal 1 bulan ini, sedangkan tutup buku ≥ tanggal 1
  return { from, to: base.to, transition: from !== base.from };
}

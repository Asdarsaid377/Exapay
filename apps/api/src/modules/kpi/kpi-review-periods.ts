import type { KpiReviewCycle, KpiReviewPeriodRange } from "@exapay/shared";

import { monthRange } from "../attendance/attendance-clock.js";

// Periode siklus penilaian KPI (feature 22) — fungsi murni, tanggal string YYYY-MM-DD dihitung UTC (seperti work-calendar.ts).
// Mingguan = Senin–Minggu · bulanan = bulan kalender · triwulanan = Jan–Mar, Apr–Jun, Jul–Sep, Okt–Des.

// Jumlah periode yang sudah berakhir yang ditawarkan saat membuat penilaian (± 2 bulan / 6 bulan / 1 tahun ke belakang)
const CANDIDATE_COUNT: Record<KpiReviewCycle, number> = { weekly: 8, monthly: 6, quarterly: 4 };

function shiftDays(isoDate: string, days: number): string {
  const time = Date.parse(`${isoDate}T00:00:00Z`) + days * 86_400_000;
  return new Date(time).toISOString().slice(0, 10);
}

// Periode siklus yang memuat tanggal ini
export function reviewPeriodOf(cycle: KpiReviewCycle, isoDate: string): KpiReviewPeriodRange {
  switch (cycle) {
    case "weekly": {
      // getUTCDay: Minggu 0 … Sabtu 6 → mundur ke Senin
      const weekday = new Date(`${isoDate}T00:00:00Z`).getUTCDay();
      const startDate = shiftDays(isoDate, -((weekday + 6) % 7));
      return { startDate, endDate: shiftDays(startDate, 6) };
    }
    case "monthly": {
      const range = monthRange(isoDate.slice(0, 7));
      return { startDate: range.from, endDate: range.to };
    }
    case "quarterly": {
      const year = isoDate.slice(0, 4);
      const firstMonth = Math.floor((Number(isoDate.slice(5, 7)) - 1) / 3) * 3 + 1;
      const lastMonth = firstMonth + 2;
      return {
        startDate: `${year}-${String(firstMonth).padStart(2, "0")}-01`,
        endDate: monthRange(`${year}-${String(lastMonth).padStart(2, "0")}`).to,
      };
    }
  }
}

export function periodsOverlap(a: KpiReviewPeriodRange, b: KpiReviewPeriodRange): boolean {
  return a.startDate <= b.endDate && b.startDate <= a.endDate;
}

// Periode siklus yang sudah berakhir sebelum hari ini dan tidak beririsan dengan periode yang sudah dibuat, terbaru dulu.
export function candidatePeriods(cycle: KpiReviewCycle, today: string, existing: readonly KpiReviewPeriodRange[]): KpiReviewPeriodRange[] {
  const candidates: KpiReviewPeriodRange[] = [];
  let period = reviewPeriodOf(cycle, shiftDays(reviewPeriodOf(cycle, today).startDate, -1));
  for (let i = 0; i < CANDIDATE_COUNT[cycle]; i += 1) {
    if (!existing.some((other) => periodsOverlap(period, other))) candidates.push(period);
    period = reviewPeriodOf(cycle, shiftDays(period.startDate, -1));
  }
  return candidates;
}

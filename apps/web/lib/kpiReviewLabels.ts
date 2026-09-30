import { KPI_REVIEW_CYCLE_LABELS, KPI_REVIEW_STATUS_LABELS, type KpiReviewCycle, type KpiReviewPeriodRange, type KpiReviewStatus } from "@exapay/shared";

import type { BadgeTone } from "@/components/common/Badge";
import { monthLabel } from "@/lib/attendanceLabels";
import { formatDateRange } from "@/lib/leaveLabels";

// Teks & tautan siklus dan penilaian KPI periodik (feature 22)

// ui-rules "Badge Status": Draf netral · Menunggu/direview warning · Final info
export const REVIEW_STATUS_TONES: Record<KpiReviewStatus, BadgeTone> = {
  draft: "neutral",
  reviewed: "warning",
  final: "info",
};

export function reviewStatusLabel(status: KpiReviewStatus): string {
  return KPI_REVIEW_STATUS_LABELS[status];
}

export function cycleLabel(cycle: KpiReviewCycle): string {
  return KPI_REVIEW_CYCLE_LABELS[cycle];
}

export const CYCLE_DESCRIPTIONS: Record<KpiReviewCycle, string> = {
  weekly: "Senin–Minggu. Cocok untuk tim kecil yang ingin umpan balik cepat.",
  monthly: "Satu bulan kalender. Pilihan umum — sejalan dengan periode gaji.",
  quarterly: "Januari–Maret, April–Juni, Juli–September, Oktober–Desember.",
};

const ROMAN = ["I", "II", "III", "IV"] as const;

// "September 2026" · "Triwulan III 2026" · "21–27 Sep 2026"
export function reviewPeriodLabel(cycle: KpiReviewCycle, period: KpiReviewPeriodRange): string {
  switch (cycle) {
    case "monthly":
      return monthLabel(period.startDate.slice(0, 7));
    case "quarterly":
      return `Triwulan ${ROMAN[Math.floor((Number(period.startDate.slice(5, 7)) - 1) / 3)] ?? ""} ${period.startDate.slice(0, 4)}`;
    case "weekly":
      return formatDateRange(period.startDate, period.endDate);
  }
}

// Rentang tanggal sebagai keterangan (mingguan sudah berupa rentang)
export function reviewPeriodRange(period: KpiReviewPeriodRange): string {
  return formatDateRange(period.startDate, period.endDate);
}

export function reviewsHref(periodId: string | null): string {
  return periodId ? `/kpi/reviews?period=${periodId}` : "/kpi/reviews";
}

import type { KpiTargetPeriod, TaskLogStatus } from "@exapay/shared";

import type { BadgeTone } from "@/components/common/Badge";

// Teks & tautan log tugas harian (feature 19)

export const TASK_STATUS_TONES: Record<TaskLogStatus, BadgeTone> = {
  pending: "warning",
  approved: "success",
  rejected: "danger",
};

const PERIOD_SUFFIX: Record<KpiTargetPeriod, string> = {
  daily: "hari",
  weekly: "minggu",
  monthly: "bulan",
};

// Desimal string → "1.250.000,5" (tanpa float — hanya pengelompokan digit)
export function formatQuantity(value: string): string {
  const [whole = "0", fraction = ""] = value.split(".");
  const grouped = whole.replace(/\B(?=([0-9]{3})+(?![0-9]))/g, ".");
  return fraction ? `${grouped},${fraction}` : grouped;
}

// "Target 120 cup/hari"
export function targetLabel(target: string, unit: string, period: KpiTargetPeriod): string {
  return `Target ${formatQuantity(target)} ${unit}/${PERIOD_SUFFIX[period]}`;
}

// Persentase realisasi harian terhadap target harian (0–100, untuk lebar bar). Angka tampilan saja — bukan skor (feature 21).
export function dailyProgress(total: string, target: string): number {
  const ratio = Number(total) / Number(target);
  return Number.isFinite(ratio) ? Math.min(100, Math.round(ratio * 100)) : 0;
}

const WEEKDAY = new Intl.DateTimeFormat("id-ID", { weekday: "short", timeZone: "UTC" });
const LONG = new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

// "Sen"
export function weekdayShort(isoDate: string): string {
  return WEEKDAY.format(new Date(`${isoDate}T00:00:00Z`));
}

// "Senin, 5 Oktober 2026"
export function longDate(isoDate: string): string {
  return LONG.format(new Date(`${isoDate}T00:00:00Z`));
}

// Hari ini tanpa param
export function myTasksHref(date: string, today: string): string {
  return date === today ? "/me/tasks" : `/me/tasks?date=${date}`;
}

// Foto dibuka lewat Route Handler portal (proxy menjaga peran per area)
export function myTaskPhotoHref(id: string, version: string): string {
  // version (updatedAt) memaksa browser memuat foto baru setelah diganti
  return `/me/tasks/${id}/photo?v=${encodeURIComponent(version)}`;
}

// Input realisasi: koma desimal (kebiasaan Indonesia) → titik; pemisah ribuan titik tidak didukung, jadi dibuang hanya jika ada koma
export function normalizeQuantityInput(value: string): string {
  const trimmed = value.trim().replace(/\s/g, "");
  return trimmed.includes(",") ? trimmed.replace(/\./g, "").replace(",", ".") : trimmed;
}

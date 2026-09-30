import { type KpiIndicatorScore, KPI_PREDICATE_LABELS, type KpiPredicate, type KpiScoreQuery, kpiScoreQuerySchema } from "@exapay/shared";

import type { BadgeTone } from "@/components/common/Badge";
import { type PeriodView, periodSearchParams } from "@/lib/attendanceRecapLabels";
import { formatQuantity, targetLabel } from "@/lib/taskLogLabels";

// Teks & tautan skor KPI ad-hoc (feature 21)

type SearchParams = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined): string | undefined => (typeof value === "string" ? value : undefined);

// Periode + tim dari URL; periode tidak valid → bulan berjalan
export function kpiScoreQueryFrom(raw: SearchParams): KpiScoreQuery {
  const parsed = kpiScoreQuerySchema.safeParse({ month: first(raw.month), from: first(raw.from), to: first(raw.to), departmentId: first(raw.team) });
  return parsed.success ? parsed.data : {};
}

export function kpiScoresHref(view: PeriodView, currentMonth: string, departmentId: string | null): string {
  const params = periodSearchParams(view, currentMonth);
  if (departmentId) params.set("team", departmentId);
  const query = params.toString();
  return query ? `/kpi/scores?${query}` : "/kpi/scores";
}

// Warna predikat mengikuti snapshot dashboard.html "Sebaran predikat KPI" & ui-rules "Badge Status"
export const PREDICATE_TONES: Record<KpiPredicate, BadgeTone> = {
  very_good: "success",
  good: "accent",
  fair: "warning",
  needs_improvement: "danger",
};

export const PREDICATE_BAR_CLASSES: Record<KpiPredicate, string> = {
  very_good: "bg-success",
  good: "bg-accent",
  fair: "bg-warning",
  needs_improvement: "bg-danger",
};

export const PREDICATE_RANGES: Record<KpiPredicate, string> = {
  very_good: "≥ 90",
  good: "75–89",
  fair: "60–74",
  needs_improvement: "< 60",
};

export function predicateLabel(predicate: KpiPredicate): string {
  return KPI_PREDICATE_LABELS[predicate];
}

// "71.3" → "71,3"
export function formatScore(value: string): string {
  return formatQuantity(value);
}

// Lebar bar capaian: 0–120% dipetakan ke 0–100% lebar (angka tampilan saja)
export function achievementBarWidth(achievement: string | null): number {
  if (achievement === null) return 0;
  const value = Number(achievement);
  return Number.isFinite(value) ? Math.min(100, Math.max(0, (value / 120) * 100)) : 0;
}

// Keterangan target indikator di template ("Target 10 cup/hari", "Target kehadiran 95%", "Dinilai atasan, skala 1–5")
export function indicatorTargetLabel(indicator: KpiIndicatorScore): string {
  switch (indicator.type) {
    case "numeric":
    case "count":
      return indicator.unit && indicator.targetPeriod ? targetLabel(indicator.target, indicator.unit, indicator.targetPeriod) : `Target ${formatQuantity(indicator.target)}`;
    case "system":
      return `Target kehadiran ${formatQuantity(indicator.target)}%`;
    case "rating":
      return `Dinilai atasan, skala 1–${indicator.target}`;
  }
}

// Realisasi dibanding target periode ("27 dari 40 cup", "Hadir 75% (target 95%)", "Nilai 4 dari 5")
export function indicatorActualLabel(indicator: KpiIndicatorScore): string {
  switch (indicator.type) {
    case "numeric":
    case "count":
      return `${formatQuantity(indicator.actual ?? "0")} dari ${formatQuantity(indicator.periodTarget)} ${indicator.unit ?? ""}`.trim();
    case "system":
      return indicator.actual === null ? "Belum ada hari hadir/alpa di periode ini" : `Hadir ${formatQuantity(indicator.actual)}% dari hari kerja`;
    case "rating":
      return indicator.actual === null ? "Dinilai atasan di penilaian periodik" : `Nilai ${formatQuantity(indicator.actual)} dari ${indicator.periodTarget}`;
  }
}

// Predikat sebagai teks berwarna (tile portal "Skor bulan ini" snapshot me.html)
export const PREDICATE_TEXT_CLASSES: Record<KpiPredicate, string> = {
  very_good: "text-success-text",
  good: "text-accent-deep",
  fair: "text-warning-text",
  needs_improvement: "text-danger-text",
};

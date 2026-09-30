import {
  formatRupiah,
  type KpiIndicator,
  type KpiIndicatorInput,
  type KpiIndicatorType,
  KPI_RATING_SCALE_MAX,
  type KpiTargetPeriod,
  type KpiTemplate,
  type KpiTemplateInput,
} from "@exapay/shared";

import { groupThousands } from "@/lib/money";

// Label, format tampilan, dan draf form template KPI (feature 18). Tanpa perhitungan — skor dihitung API (feature 21).

export const INDICATOR_TYPE_LABELS: Record<KpiIndicatorType, string> = {
  numeric: "Angka",
  count: "Jumlah",
  rating: "Penilaian atasan",
  system: "Otomatis sistem",
};

export const INDICATOR_TYPE_HINTS: Record<KpiIndicatorType, string> = {
  numeric: "Nilai seperti omzet (Rp) atau berat (kg). Boleh 2 angka di belakang koma.",
  count: "Hitungan bilangan bulat, seperti transaksi, pesanan, atau unit.",
  rating: `Atasan memberi nilai 1–${KPI_RATING_SCALE_MAX} saat penilaian periodik.`,
  system: "Dihitung otomatis dari rekap absensi — karyawan tidak mengisi.",
};

export const TARGET_PERIOD_LABELS: Record<KpiTargetPeriod, string> = {
  daily: "per hari",
  weekly: "per minggu",
  monthly: "per bulan",
};

// "1500000.5" → "1.500.000,5" (format Indonesia)
function formatDecimal(value: string): string {
  const [whole = "0", fraction] = value.split(".");
  return fraction ? `${groupThousands(whole)},${fraction}` : groupThousands(whole);
}

// Ringkasan target satu indikator, mis. "80 transaksi per hari", "Rp 50.000.000 per bulan", "Skala 1–5", "95% hari kerja"
export function formatIndicatorTarget(indicator: KpiIndicator): string {
  switch (indicator.type) {
    case "numeric":
    case "count": {
      const period = indicator.targetPeriod ? ` ${TARGET_PERIOD_LABELS[indicator.targetPeriod]}` : "";
      const amount = indicator.unit === "Rp" ? formatRupiah(indicator.target) : `${formatDecimal(indicator.target)} ${indicator.unit ?? ""}`.trim();
      return `${amount}${period}`;
    }
    case "rating":
      return `Skala 1–${KPI_RATING_SCALE_MAX}`;
    case "system":
      return `Kehadiran ${indicator.target}% hari kerja`;
  }
}

// ---- Draf form ----
// Target & bobot disimpan sebagai teks tampilan (target: "1.500.000,5"); dikonversi saat simpan.

export type IndicatorDraft = {
  // Kunci React stabil (id indikator, atau acak untuk indikator baru)
  key: string;
  id?: string;
  name: string;
  type: KpiIndicatorType;
  unit: string;
  target: string;
  targetPeriod: KpiTargetPeriod;
  weight: string;
};

export type TemplateDraft = {
  name: string;
  description: string;
  positionIds: string[];
  indicators: IndicatorDraft[];
};

export const DEFAULT_ATTENDANCE_TARGET = "95";

export function newIndicatorDraft(key: string): IndicatorDraft {
  return { key, name: "", type: "count", unit: "", target: "", targetPeriod: "daily", weight: "" };
}

function indicatorDraftOf(indicator: KpiIndicator, keepId: boolean): IndicatorDraft {
  return {
    key: indicator.id,
    id: keepId ? indicator.id : undefined,
    name: indicator.name,
    type: indicator.type,
    unit: indicator.unit ?? "",
    target: indicator.type === "rating" ? "" : formatDecimal(indicator.target),
    targetPeriod: indicator.targetPeriod ?? "daily",
    weight: String(indicator.weight),
  };
}

// Ubah (keepIds) atau salin (tanpa id & tanpa jabatan — jabatan hanya boleh punya satu template)
export function draftFromTemplate(template: KpiTemplate, mode: "edit" | "copy"): TemplateDraft {
  return {
    name: mode === "copy" ? `Salinan ${template.name}`.slice(0, 80) : template.name,
    description: template.description ?? "",
    positionIds: mode === "copy" ? [] : template.positions.map((position) => position.id),
    indicators: template.indicators.map((indicator) => indicatorDraftOf(indicator, mode === "edit")),
  };
}

// Teks target yang diketik → hanya digit + satu koma (desimal maks 2 angka jika diizinkan), ribuan diberi titik
export function sanitizeTargetInput(value: string, allowDecimal: boolean): string {
  const cleaned = value.replace(/[^0-9,]/g, "");
  const [wholeRaw = "", ...rest] = cleaned.split(",");
  const whole = wholeRaw.replace(/^0+(?=[0-9])/, "").slice(0, allowDecimal ? 13 : 9);
  if (!allowDecimal || rest.length === 0) return groupThousands(whole);
  return `${groupThousands(whole)},${rest.join("").slice(0, 2)}`;
}

// "1.500.000,5" → "1500000.5"
function targetValue(display: string): string {
  return display.replace(/\./g, "").replace(",", ".").replace(/\.$/, "");
}

function weightValue(display: string): number {
  return display.trim() === "" ? Number.NaN : Number(display);
}

function indicatorInputOf(draft: IndicatorDraft): KpiIndicatorInput {
  const base = { id: draft.id, name: draft.name, weight: weightValue(draft.weight) };
  switch (draft.type) {
    case "numeric":
    case "count":
      return { ...base, type: draft.type, unit: draft.unit, target: targetValue(draft.target), targetPeriod: draft.targetPeriod };
    case "rating":
      return { ...base, type: "rating" };
    case "system":
      return { ...base, type: "system", systemMetric: "attendance_rate", target: targetValue(draft.target) };
  }
}

export function templateInputFromDraft(draft: TemplateDraft): KpiTemplateInput {
  return {
    name: draft.name,
    description: draft.description.trim() ? draft.description : null,
    positionIds: draft.positionIds,
    indicators: draft.indicators.map(indicatorInputOf),
  };
}

// Total bobot yang sudah diisi (isian kosong/tidak valid dihitung 0)
export function weightTotal(indicators: IndicatorDraft[]): number {
  return indicators.reduce((sum, indicator) => {
    const weight = weightValue(indicator.weight);
    return Number.isFinite(weight) ? sum + weight : sum;
  }, 0);
}

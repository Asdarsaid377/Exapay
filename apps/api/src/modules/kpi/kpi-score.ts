import {
  KPI_ACHIEVEMENT_CAP,
  KPI_PREDICATE_MIN,
  KPI_RATING_SCALE_MAX,
  KPI_SCORE_MAX,
  type KpiIndicatorScore,
  type KpiIndicatorType,
  type KpiPredicate,
  type KpiScoreDays,
  type KpiScoreResult,
  type KpiSystemMetric,
  type KpiTargetPeriod,
  trimDecimal,
} from "@exapay/shared";
import { Decimal } from "decimal.js";

import { monthRange } from "../attendance/attendance-clock.js";
import type { RecapDay } from "../attendance/attendance-recap.js";
import { countWorkingDays, type WorkCalendar } from "../attendance/work-calendar.js";

// Skor KPI satu karyawan untuk satu rentang (feature 21) — fungsi murni: tanpa DB, tanpa tanggal sistem.
// Rumus lengkap di packages/shared/src/kpiScores.ts. Dipakai skor ad-hoc; penilaian periodik (feature 22) menyimpan snapshot hasilnya.
//
// Pembulatan (HALF_UP) agar angka di layar bisa dihitung ulang dengan tangan:
// target periode 2 desimal → capaian dari target yang sudah dibulatkan, 1 desimal → poin = capaian × bobot ÷ 100 (eksak)
// → skor = Σ poin ÷ Σ bobot dihitung × 100, 1 desimal. Persen kehadiran 1 desimal sebelum dibagi target.

// Konstruktor Decimal lokal: presisi lebar, pembulatan eksplisit (tidak bergantung default global decimal.js)
const Num = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });
type Num = InstanceType<typeof Num>;

const HUNDRED = new Num(100);
const CAP = new Num(KPI_ACHIEVEMENT_CAP);

export type ScoreIndicator = {
  id: string;
  name: string;
  type: KpiIndicatorType;
  unit: string | null;
  // String desimal; rating = skala maks., system = persen
  target: string;
  targetPeriod: KpiTargetPeriod | null;
  systemMetric: KpiSystemMetric | null;
  weight: number;
};

export type KpiScoreInput = {
  // Harus mencakup bulan penuh dari setiap hari target (pembagi target bulanan = hari kerja sebulan)
  calendar: WorkCalendar;
  // Status harian dari recapEmployee untuk rentang skor (sudah dipotong sampai hari ini)
  days: readonly RecapDay[];
  indicators: readonly ScoreIndicator[];
  // Realisasi terverifikasi per id indikator (verifiedTaskTotals); tidak ada = 0
  actuals: ReadonlyMap<string, string>;
  // Nilai penilaian atasan 1–KPI_RATING_SCALE_MAX per id indikator (penilaian periodik, feature 22); tidak ada = belum dinilai
  ratings: ReadonlyMap<string, number>;
};

// Hari yang menuntut target: hari kerja dalam masa kerja, bukan izin/sakit/cuti (pending = hari ini belum absen)
const TARGET_STATUSES = new Set<RecapDay["status"]>(["on_time", "late", "absent", "pending"]);

export function scoreDays(days: readonly RecapDay[]): KpiScoreDays {
  const count = (statuses: readonly RecapDay["status"][]): number => days.filter((day) => statuses.includes(day.status)).length;
  return {
    targetDays: days.filter((day) => TARGET_STATUSES.has(day.status)).length,
    present: count(["on_time", "late"]),
    absent: count(["absent"]),
    leaveDays: count(["permit", "sick", "leave"]),
  };
}

export function kpiPredicate(score: string): KpiPredicate {
  const value = new Num(score);
  if (value.gte(KPI_PREDICATE_MIN.very_good)) return "very_good";
  if (value.gte(KPI_PREDICATE_MIN.good)) return "good";
  if (value.gte(KPI_PREDICATE_MIN.fair)) return "fair";
  return "needs_improvement";
}

function text(value: Num, decimals: number): string {
  return trimDecimal(value.toFixed(decimals, Num.ROUND_HALF_UP));
}

// Persen capaian 1 desimal, maks. 120
function achievementOf(actual: Num, target: Num): Num {
  return Num.min(actual.div(target).times(HUNDRED), CAP).toDecimalPlaces(1, Num.ROUND_HALF_UP);
}

// Target periode = jumlah target per hari target. Mingguan ÷ hari kerja per minggu jadwal; bulanan ÷ hari kerja bulan tanggal itu.
function periodTargetOf(indicator: ScoreIndicator, targetDates: readonly string[], calendar: WorkCalendar): Num {
  const target = new Num(indicator.target);
  const monthDays = new Map<string, number>();
  let total = new Num(0);
  for (const date of targetDates) {
    switch (indicator.targetPeriod) {
      case "daily":
        total = total.plus(target);
        break;
      case "weekly":
        total = total.plus(target.div(calendar.workdays.size));
        break;
      case "monthly": {
        const month = date.slice(0, 7);
        let divisor = monthDays.get(month);
        if (divisor === undefined) {
          const range = monthRange(month);
          divisor = countWorkingDays(calendar, range.from, range.to);
          monthDays.set(month, divisor);
        }
        // Tanggal target selalu hari kerja → pembagi ≥ 1
        total = total.plus(target.div(divisor));
        break;
      }
      case null:
        // CHECK kpi_indicators_type_fields: numeric/count selalu punya satuan waktu
        throw new Error(`[kpi/score] indikator ${indicator.id} tanpa satuan waktu target`);
    }
  }
  return total.toDecimalPlaces(2, Num.ROUND_HALF_UP);
}

type Scored = { periodTarget: Num; actual: Num | null; achievement: Num | null };

function scoreIndicator(indicator: ScoreIndicator, input: KpiScoreInput, days: KpiScoreDays, targetDates: readonly string[]): Scored {
  switch (indicator.type) {
    case "numeric":
    case "count": {
      const periodTarget = periodTargetOf(indicator, targetDates, input.calendar);
      const actual = new Num(input.actuals.get(indicator.id) ?? "0");
      return { periodTarget, actual, achievement: periodTarget.gt(0) ? achievementOf(actual, periodTarget) : null };
    }
    case "system": {
      const target = new Num(indicator.target);
      const counted = days.present + days.absent;
      if (counted === 0) return { periodTarget: target, actual: null, achievement: null };
      const rate = new Num(days.present).div(counted).times(HUNDRED).toDecimalPlaces(1, Num.ROUND_HALF_UP);
      return { periodTarget: target, actual: rate, achievement: achievementOf(rate, target) };
    }
    case "rating": {
      const scale = new Num(KPI_RATING_SCALE_MAX);
      const rating = input.ratings.get(indicator.id);
      if (rating === undefined) return { periodTarget: scale, actual: null, achievement: null };
      const actual = new Num(rating);
      return { periodTarget: scale, actual, achievement: achievementOf(actual, scale) };
    }
  }
}

export function kpiScore(input: KpiScoreInput): KpiScoreResult {
  const days = scoreDays(input.days);
  const targetDates = input.days.filter((day) => TARGET_STATUSES.has(day.status)).map((day) => day.date);

  let pointTotal = new Num(0);
  let countedWeight = 0;
  const indicators: KpiIndicatorScore[] = input.indicators.map((indicator) => {
    const scored = scoreIndicator(indicator, input, days, targetDates);
    const points = scored.achievement ? scored.achievement.times(indicator.weight).div(HUNDRED) : null;
    if (points) {
      pointTotal = pointTotal.plus(points);
      countedWeight += indicator.weight;
    }
    return {
      id: indicator.id,
      name: indicator.name,
      type: indicator.type,
      unit: indicator.unit,
      targetPeriod: indicator.targetPeriod,
      systemMetric: indicator.systemMetric,
      weight: indicator.weight,
      target: trimDecimal(indicator.target),
      periodTarget: text(scored.periodTarget, 2),
      actual: scored.actual ? text(scored.actual, 2) : null,
      achievement: scored.achievement ? text(scored.achievement, 1) : null,
      points: points ? trimDecimal(points.toFixed()) : null,
      status: points ? "scored" : indicator.type === "rating" ? "not_rated" : "not_applicable",
    };
  });

  const totals = { pointTotal: trimDecimal(pointTotal.toFixed()), countedWeight };
  if (countedWeight === 0) return { score: null, predicate: null, ...totals, days, indicators };
  const raw = pointTotal.div(countedWeight).times(HUNDRED);
  const score = text(Num.min(raw, KPI_SCORE_MAX), 1);
  return { score, predicate: kpiPredicate(score), ...totals, days, indicators };
}

// Rata-rata skor tim (1 desimal); null jika tidak ada skor
export function averageScore(scores: readonly string[]): string | null {
  if (scores.length === 0) return null;
  const total = scores.reduce((sum, score) => sum.plus(score), new Num(0));
  return text(total.div(scores.length), 1);
}

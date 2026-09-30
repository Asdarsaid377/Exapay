import type { Weekday } from "@exapay/shared";
import { describe, expect, it } from "vitest";

import type { RecapDay } from "../src/modules/attendance/attendance-recap.js";
import type { WorkCalendar } from "../src/modules/attendance/work-calendar.js";
import { averageScore, kpiPredicate, kpiScore, type KpiScoreInput, type ScoreIndicator } from "../src/modules/kpi/kpi-score.js";

// Verifikasi feature 21: skenario skor KPI ad-hoc (murni, tanpa DB). Oktober & September 2026 masing-masing 22 hari kerja Sen–Jum.

const MON_FRI: WorkCalendar = { workdays: new Set<Weekday>([1, 2, 3, 4, 5]), holidays: new Set<string>() };

// Senin 5 – Jumat 9 Okt 2026, semua hadir
const WEEK: RecapDay[] = ["05", "06", "07", "08", "09"].map((day) => ({ date: `2026-10-${day}`, status: "on_time" }));

function withStatus(days: RecapDay[], changes: Record<string, RecapDay["status"]>): RecapDay[] {
  return days.map((day) => ({ ...day, status: changes[day.date] ?? day.status }));
}

let nextId = 0;
function indicator(overrides: Partial<ScoreIndicator> & Pick<ScoreIndicator, "type" | "weight">): ScoreIndicator {
  nextId += 1;
  const defaults: ScoreIndicator =
    overrides.type === "system"
      ? { id: `i${nextId}`, name: "Kehadiran", type: "system", unit: null, target: "95", targetPeriod: null, systemMetric: "attendance_rate", weight: 0 }
      : overrides.type === "rating"
        ? { id: `i${nextId}`, name: "Sikap kerja", type: "rating", unit: null, target: "5", targetPeriod: null, systemMetric: null, weight: 0 }
        : { id: `i${nextId}`, name: "Transaksi", type: overrides.type, unit: "transaksi", target: "10", targetPeriod: "daily", systemMetric: null, weight: 0 };
  return { ...defaults, ...overrides };
}

function input(overrides: Partial<KpiScoreInput>): KpiScoreInput {
  return { calendar: MON_FRI, days: WEEK, indicators: [], actuals: new Map(), ratings: new Map(), ...overrides };
}

describe("kpiScore — target diprorata per hari target", () => {
  it("harian: target × hari target; capaian = realisasi ÷ target", () => {
    const count = indicator({ type: "count", weight: 100 });
    const result = kpiScore(input({ indicators: [count], actuals: new Map([[count.id, "45"]]) }));
    expect(result.indicators[0]).toMatchObject({ periodTarget: "50", actual: "45", achievement: "90", points: "90", status: "scored" });
    expect(result).toMatchObject({ score: "90", predicate: "very_good", countedWeight: 100 });
  });

  it("mingguan: target ÷ hari kerja per minggu × hari target", () => {
    const count = indicator({ type: "count", weight: 100, target: "10", targetPeriod: "weekly" });
    const days = WEEK.slice(0, 3);
    const result = kpiScore(input({ days, indicators: [count], actuals: new Map([[count.id, "6"]]) }));
    expect(result.indicators[0]).toMatchObject({ periodTarget: "6", achievement: "100" });
  });

  it("bulanan: target ÷ hari kerja bulan itu, per tanggal (rentang lintas bulan, ada libur)", () => {
    // 1 Okt libur → Oktober 21 hari kerja; September 22. 28–30 Sep = 3 × 105.000, 2 Okt = 110.000
    const calendar: WorkCalendar = { workdays: MON_FRI.workdays, holidays: new Set(["2026-10-01"]) };
    const days: RecapDay[] = [
      { date: "2026-09-28", status: "on_time" },
      { date: "2026-09-29", status: "late" },
      { date: "2026-09-30", status: "on_time" },
      { date: "2026-10-01", status: "off" },
      { date: "2026-10-02", status: "on_time" },
    ];
    const sales = indicator({ type: "numeric", weight: 100, unit: "Rp", target: "2310000", targetPeriod: "monthly" });
    const result = kpiScore(input({ calendar, days, indicators: [sales], actuals: new Map([[sales.id, "340000"]]) }));
    expect(result.days.targetDays).toBe(4);
    expect(result.indicators[0]).toMatchObject({ periodTarget: "425000", actual: "340000", achievement: "80" });
  });

  it("target periode dibulatkan 2 desimal sebelum capaian", () => {
    // 50.000.000 ÷ 22 × 5 = 11.363.636,3636… → 11.363.636,36
    const sales = indicator({ type: "numeric", weight: 100, target: "50000000", targetPeriod: "monthly" });
    const result = kpiScore(input({ indicators: [sales], actuals: new Map([[sales.id, "11363636.36"]]) }));
    expect(result.indicators[0]).toMatchObject({ periodTarget: "11363636.36", achievement: "100" });
  });

  it("izin/sakit/cuti disetujui dikeluarkan dari hari target; alpa tetap dihitung", () => {
    const days = withStatus(WEEK, { "2026-10-06": "sick", "2026-10-07": "leave", "2026-10-08": "absent" });
    const count = indicator({ type: "count", weight: 100 });
    const result = kpiScore(input({ days, indicators: [count], actuals: new Map([[count.id, "30"]]) }));
    expect(result.days).toEqual({ targetDays: 3, present: 2, absent: 1, leaveDays: 2 });
    expect(result.indicators[0]).toMatchObject({ periodTarget: "30", achievement: "100" });
  });

  it("hari ini belum absen (pending) tetap hari target, tapi belum menurunkan kehadiran", () => {
    const days = withStatus(WEEK, { "2026-10-09": "pending" });
    const count = indicator({ type: "count", weight: 50 });
    const attendance = indicator({ type: "system", weight: 50, target: "100" });
    const result = kpiScore(input({ days, indicators: [count, attendance], actuals: new Map([[count.id, "50"]]) }));
    expect(result.indicators[0]).toMatchObject({ periodTarget: "50", achievement: "100" });
    expect(result.indicators[1]).toMatchObject({ actual: "100", achievement: "100" });
  });

  it("realisasi tidak ada = 0", () => {
    const count = indicator({ type: "count", weight: 100 });
    const result = kpiScore(input({ indicators: [count] }));
    expect(result.indicators[0]).toMatchObject({ actual: "0", achievement: "0", points: "0", status: "scored" });
    expect(result).toMatchObject({ score: "0", predicate: "needs_improvement" });
  });
});

describe("kpiScore — capaian, bobot, skor", () => {
  it("capaian maks. 120%", () => {
    const count = indicator({ type: "count", weight: 100 });
    const result = kpiScore(input({ indicators: [count], actuals: new Map([[count.id, "100"]]) }));
    expect(result.indicators[0]).toMatchObject({ achievement: "120", points: "120" });
  });

  it("kelebihan menutup kekurangan indikator lain, skor total maks. 100", () => {
    const a = indicator({ type: "count", weight: 50 });
    const b = indicator({ type: "count", weight: 50 });
    const partial = kpiScore(input({ indicators: [a, b], actuals: new Map([[a.id, "60"], [b.id, "45"]]) }));
    // 120 × 0,5 + 90 × 0,5 = 105 → 100
    expect(partial).toMatchObject({ score: "100", predicate: "very_good" });
    const compensated = kpiScore(input({ indicators: [a, b], actuals: new Map([[a.id, "60"], [b.id, "35"]]) }));
    // 60 + 35 = 95
    expect(compensated.score).toBe("95");
  });

  it("capaian dibulatkan 1 desimal HALF_UP, poin eksak dari capaian tampilan", () => {
    const count = indicator({ type: "count", weight: 30, target: "3", targetPeriod: "weekly" });
    const other = indicator({ type: "count", weight: 70 });
    // Target 3/minggu × 5 hari = 3; realisasi 2 → 66,666… → 66,7; poin 66,7 × 30% = 20,01
    const result = kpiScore(input({ indicators: [count, other], actuals: new Map([[count.id, "2"], [other.id, "50"]]) }));
    expect(result.indicators[0]).toMatchObject({ achievement: "66.7", points: "20.01" });
    // (20,01 + 70) ÷ 100 × 100 = 90,01 → 90
    expect(result.score).toBe("90");
  });

  it("kehadiran = hadir ÷ (hadir + alpa) dibanding target persen", () => {
    const days = withStatus(WEEK, { "2026-10-08": "absent", "2026-10-09": "permit" });
    const attendance = indicator({ type: "system", weight: 100, target: "95" });
    const result = kpiScore(input({ days, indicators: [attendance] }));
    // 3 ÷ 4 = 75% → 75 ÷ 95 = 78,947… → 78,9
    expect(result.indicators[0]).toMatchObject({ periodTarget: "95", actual: "75", achievement: "78.9", status: "scored" });
    expect(result).toMatchObject({ score: "78.9", predicate: "good" });
  });

  it("penilaian atasan belum dinilai → dilewati, bobotnya keluar dari pembagi", () => {
    const count = indicator({ type: "count", weight: 80 });
    const rating = indicator({ type: "rating", weight: 20 });
    const result = kpiScore(input({ indicators: [count, rating], actuals: new Map([[count.id, "40"]]) }));
    expect(result.indicators[1]).toMatchObject({ actual: null, achievement: null, points: null, status: "not_rated", periodTarget: "5" });
    // 80 × 80% = 64 ÷ 80 × 100 = 80
    expect(result).toMatchObject({ countedWeight: 80, score: "80", predicate: "good" });
  });

  it("penilaian atasan sudah dinilai → nilai ÷ skala", () => {
    const count = indicator({ type: "count", weight: 80 });
    const rating = indicator({ type: "rating", weight: 20 });
    const result = kpiScore(input({ indicators: [count, rating], actuals: new Map([[count.id, "40"]]), ratings: new Map([[rating.id, 4]]) }));
    expect(result.indicators[1]).toMatchObject({ actual: "4", achievement: "80", points: "16", status: "scored" });
    expect(result).toMatchObject({ countedWeight: 100, score: "80" });
  });

  it("tanpa hari target (cuti seluruh periode) → indikator tidak dihitung, skor kosong", () => {
    const days = WEEK.map((day) => ({ ...day, status: "leave" as const }));
    const count = indicator({ type: "count", weight: 60 });
    const attendance = indicator({ type: "system", weight: 40 });
    const result = kpiScore(input({ days, indicators: [count, attendance], actuals: new Map([[count.id, "5"]]) }));
    expect(result.indicators.map((i) => i.status)).toEqual(["not_applicable", "not_applicable"]);
    expect(result.indicators[0]).toMatchObject({ periodTarget: "0", achievement: null });
    expect(result).toMatchObject({ score: null, predicate: null, pointTotal: "0", countedWeight: 0 });
  });

  it("contoh lengkap template campuran (angka UI = hitung manual)", () => {
    const transactions = indicator({ type: "count", weight: 40 });
    const sales = indicator({ type: "numeric", weight: 30, unit: "Rp", target: "22000000", targetPeriod: "monthly" });
    const attendance = indicator({ type: "system", weight: 20, target: "95" });
    const rating = indicator({ type: "rating", weight: 10 });
    const result = kpiScore(
      input({
        indicators: [transactions, sales, attendance, rating],
        actuals: new Map([
          [transactions.id, "45"],
          [sales.id, "4000000.5"],
        ]),
      }),
    );
    expect(result.indicators.map((i) => [i.periodTarget, i.actual, i.achievement, i.points])).toEqual([
      ["50", "45", "90", "36"],
      // 22.000.000 ÷ 22 × 5 = 5.000.000; 4.000.000,5 ÷ 5.000.000 = 80,00001% → 80
      ["5000000", "4000000.5", "80", "24"],
      // 100% ÷ 95% = 105,26… → 105,3
      ["95", "100", "105.3", "21.06"],
      ["5", null, null, null],
    ]);
    // (36 + 24 + 21,06) ÷ 90 × 100 = 90,0666… → 90,1
    expect(result).toMatchObject({ pointTotal: "81.06", countedWeight: 90, score: "90.1", predicate: "very_good" });
  });
});

describe("kpiPredicate & averageScore", () => {
  it("batas predikat: ≥90 Sangat Baik, 75–89 Baik, 60–74 Cukup, <60 Perlu Perbaikan", () => {
    expect(["100", "90", "89.9", "75", "74.9", "60", "59.9", "0"].map(kpiPredicate)).toEqual([
      "very_good",
      "very_good",
      "good",
      "good",
      "fair",
      "fair",
      "needs_improvement",
      "needs_improvement",
    ]);
  });

  it("rata-rata tim 1 desimal; tanpa skor → null", () => {
    expect(averageScore(["90.1", "80", "75.05"])).toBe("81.7");
    expect(averageScore([])).toBeNull();
  });
});

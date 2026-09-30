import { describe, expect, it } from "vitest";

import { candidatePeriods, periodsOverlap, reviewPeriodOf } from "../src/modules/kpi/kpi-review-periods.js";

// Verifikasi feature 22: periode siklus penilaian KPI (murni, tanpa DB).

describe("reviewPeriodOf", () => {
  it("mingguan = Senin–Minggu, termasuk lintas bulan/tahun", () => {
    // Kamis 1 Okt 2026
    expect(reviewPeriodOf("weekly", "2026-10-01")).toEqual({ startDate: "2026-09-28", endDate: "2026-10-04" });
    // Senin & Minggu
    expect(reviewPeriodOf("weekly", "2026-10-05")).toEqual({ startDate: "2026-10-05", endDate: "2026-10-11" });
    expect(reviewPeriodOf("weekly", "2026-10-11")).toEqual({ startDate: "2026-10-05", endDate: "2026-10-11" });
    expect(reviewPeriodOf("weekly", "2027-01-01")).toEqual({ startDate: "2026-12-28", endDate: "2027-01-03" });
  });

  it("bulanan = bulan kalender (Februari kabisat)", () => {
    expect(reviewPeriodOf("monthly", "2026-10-15")).toEqual({ startDate: "2026-10-01", endDate: "2026-10-31" });
    expect(reviewPeriodOf("monthly", "2028-02-10")).toEqual({ startDate: "2028-02-01", endDate: "2028-02-29" });
  });

  it("triwulanan = Jan–Mar, Apr–Jun, Jul–Sep, Okt–Des", () => {
    expect(reviewPeriodOf("quarterly", "2026-01-01")).toEqual({ startDate: "2026-01-01", endDate: "2026-03-31" });
    expect(reviewPeriodOf("quarterly", "2026-06-30")).toEqual({ startDate: "2026-04-01", endDate: "2026-06-30" });
    expect(reviewPeriodOf("quarterly", "2026-08-17")).toEqual({ startDate: "2026-07-01", endDate: "2026-09-30" });
    expect(reviewPeriodOf("quarterly", "2026-12-31")).toEqual({ startDate: "2026-10-01", endDate: "2026-12-31" });
  });
});

describe("candidatePeriods", () => {
  it("hanya periode yang sudah berakhir, terbaru dulu, sejumlah batas per siklus", () => {
    const monthly = candidatePeriods("monthly", "2026-10-01", []);
    expect(monthly.map((period) => period.startDate)).toEqual(["2026-09-01", "2026-08-01", "2026-07-01", "2026-06-01", "2026-05-01", "2026-04-01"]);
    // Minggu berjalan (28 Sep – 4 Okt) belum berakhir
    const weekly = candidatePeriods("weekly", "2026-10-04", []);
    expect(weekly).toHaveLength(8);
    expect(weekly[0]).toEqual({ startDate: "2026-09-21", endDate: "2026-09-27" });
    expect(candidatePeriods("quarterly", "2026-10-01", []).map((period) => period.startDate)).toEqual(["2026-07-01", "2026-04-01", "2026-01-01", "2025-10-01"]);
  });

  it("melewati periode yang beririsan dengan periode yang sudah dibuat (termasuk siklus lain)", () => {
    const existing = [
      { startDate: "2026-09-01", endDate: "2026-09-30" },
      // Periode mingguan lama di bulan Juli
      { startDate: "2026-07-27", endDate: "2026-08-02" },
    ];
    expect(candidatePeriods("monthly", "2026-10-05", existing).map((period) => period.startDate)).toEqual(["2026-06-01", "2026-05-01", "2026-04-01"]);
    // Triwulan III beririsan dengan September
    expect(candidatePeriods("quarterly", "2026-10-05", existing).map((period) => period.startDate)).toEqual(["2026-04-01", "2026-01-01", "2025-10-01"]);
  });

  it("periodsOverlap memakai rentang inklusif", () => {
    expect(periodsOverlap({ startDate: "2026-09-01", endDate: "2026-09-30" }, { startDate: "2026-09-30", endDate: "2026-10-06" })).toBe(true);
    expect(periodsOverlap({ startDate: "2026-09-01", endDate: "2026-09-30" }, { startDate: "2026-10-01", endDate: "2026-10-31" })).toBe(false);
  });
});

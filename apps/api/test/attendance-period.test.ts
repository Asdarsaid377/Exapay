import { describe, expect, it } from "vitest";

import { cutoffRange, payrollMonthOf, payrollPeriodRange, shiftMonth } from "../src/modules/attendance/attendance-period.js";

// Periode absensi payroll dengan tanggal tutup buku (feature 30b)
describe("cutoffRange", () => {
  it("tanpa tutup buku = bulan kalender", () => {
    expect(cutoffRange("2026-02", null)).toEqual({ from: "2026-02-01", to: "2026-02-28" });
  });
  it("tutup buku 25: Oktober = 26 Sep – 25 Okt; Januari melewati tahun", () => {
    expect(cutoffRange("2026-10", 25)).toEqual({ from: "2026-09-26", to: "2026-10-25" });
    expect(cutoffRange("2027-01", 25)).toEqual({ from: "2026-12-26", to: "2027-01-25" });
  });
  it("tutup buku 28 di Maret: mulai 1 Maret (28 Feb + 1); tutup buku 1", () => {
    expect(cutoffRange("2027-03", 28)).toEqual({ from: "2027-03-01", to: "2027-03-28" });
    expect(cutoffRange("2026-10", 1)).toEqual({ from: "2026-09-02", to: "2026-10-01" });
  });
});

describe("payrollMonthOf", () => {
  it("tanggal setelah tutup buku masuk bulan berikutnya", () => {
    expect(payrollMonthOf("2026-10-25", 25)).toBe("2026-10");
    expect(payrollMonthOf("2026-10-26", 25)).toBe("2026-11");
    expect(payrollMonthOf("2026-12-31", 25)).toBe("2027-01");
    expect(payrollMonthOf("2026-10-31", null)).toBe("2026-10");
  });
});

describe("payrollPeriodRange", () => {
  it("bulan lalu final dengan rentang baku → bukan peralihan", () => {
    expect(payrollPeriodRange("2026-10", 25, { month: "2026-09", periodEnd: "2026-09-25" })).toEqual({ from: "2026-09-26", to: "2026-10-25", transition: false });
  });
  it("tutup buku diubah dari akhir bulan ke 25 → periode peralihan pendek", () => {
    expect(payrollPeriodRange("2026-10", 25, { month: "2026-09", periodEnd: "2026-09-30" })).toEqual({ from: "2026-10-01", to: "2026-10-25", transition: true });
  });
  it("tutup buku diubah dari 25 ke akhir bulan → periode peralihan panjang", () => {
    expect(payrollPeriodRange("2026-11", null, { month: "2026-10", periodEnd: "2026-10-25" })).toEqual({ from: "2026-10-26", to: "2026-11-30", transition: true });
  });
  it("final bukan bulan tepat sebelumnya → rentang baku", () => {
    expect(payrollPeriodRange("2026-12", 25, { month: "2026-10", periodEnd: "2026-10-31" })).toEqual({ from: "2026-11-26", to: "2026-12-25", transition: false });
  });
  it("shiftMonth", () => {
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
  });
});

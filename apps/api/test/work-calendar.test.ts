import type { Weekday } from "@exapay/shared";
import { describe, expect, it } from "vitest";

import {
  countHolidaysOnWorkdays,
  countWorkingDays,
  isoWeekday,
  isWorkingDay,
  type WorkCalendar,
  workingDatesBetween,
  workingDaysByMonth,
} from "../src/modules/attendance/work-calendar.js";

// Verifikasi feature 13: fungsi hitung hari kerja (murni, tanpa DB).

function calendar(workdays: Weekday[], holidays: string[] = []): WorkCalendar {
  return { workdays: new Set(workdays), holidays: new Set(holidays) };
}

const MON_FRI = calendar([1, 2, 3, 4, 5]);
const MON_SAT = calendar([1, 2, 3, 4, 5, 6]);

describe("isoWeekday", () => {
  it("Senin = 1 … Minggu = 7", () => {
    expect(isoWeekday("2026-09-28")).toBe(1);
    expect(isoWeekday("2026-10-03")).toBe(6);
    expect(isoWeekday("2026-10-04")).toBe(7);
    // Tahun kabisat
    expect(isoWeekday("2028-02-29")).toBe(2);
  });
});

describe("hitung hari kerja", () => {
  it("Senin–Jumat tanpa libur: September 2026 = 22 hari", () => {
    expect(countWorkingDays(MON_FRI, "2026-09-01", "2026-09-30")).toBe(22);
  });

  it("Senin–Sabtu: September 2026 = 26 hari", () => {
    expect(countWorkingDays(MON_SAT, "2026-09-01", "2026-09-30")).toBe(26);
  });

  it("rentang inklusif; satu hari; from > to = 0", () => {
    expect(countWorkingDays(MON_FRI, "2026-09-28", "2026-09-28")).toBe(1);
    expect(countWorkingDays(MON_FRI, "2026-10-03", "2026-10-04")).toBe(0);
    expect(countWorkingDays(MON_FRI, "2026-09-30", "2026-09-01")).toBe(0);
  });

  it("libur di hari kerja mengurangi, libur di akhir pekan tidak", () => {
    // Maret 2026: 22 hari Senin–Jumat. Libur nasional/cuti bersama di hari kerja: 18, 19, 20, 23, 24 → 17. 21–22 Maret jatuh Sabtu–Minggu.
    const cal = calendar([1, 2, 3, 4, 5], ["2026-03-18", "2026-03-19", "2026-03-20", "2026-03-21", "2026-03-22", "2026-03-23", "2026-03-24"]);
    expect(countWorkingDays(MON_FRI, "2026-03-01", "2026-03-31")).toBe(22);
    expect(countWorkingDays(cal, "2026-03-01", "2026-03-31")).toBe(17);
    expect(countHolidaysOnWorkdays(cal, "2026-03-01", "2026-03-31")).toBe(5);
    expect(isWorkingDay(cal, "2026-03-19")).toBe(false);
    expect(isWorkingDay(cal, "2026-03-25")).toBe(true);
  });

  it("libur di luar rentang tidak dihitung", () => {
    const cal = calendar([1, 2, 3, 4, 5], ["2026-08-17", "2026-10-01"]);
    expect(countHolidaysOnWorkdays(cal, "2026-09-01", "2026-09-30")).toBe(0);
    expect(countWorkingDays(cal, "2026-09-01", "2026-09-30")).toBe(22);
  });

  it("melewati akhir bulan, akhir tahun, dan 29 Februari", () => {
    expect(workingDatesBetween(MON_FRI, "2026-12-30", "2027-01-04")).toEqual(["2026-12-30", "2026-12-31", "2027-01-01", "2027-01-04"]);
    expect(workingDatesBetween(MON_FRI, "2028-02-28", "2028-03-01")).toEqual(["2028-02-28", "2028-02-29", "2028-03-01"]);
  });

  it("per bulan dalam setahun berjumlah sama dengan hitungan setahun", () => {
    const cal = calendar([1, 2, 3, 4, 5], ["2026-01-01", "2026-08-17", "2026-12-25"]);
    const months = workingDaysByMonth(cal, 2026);
    expect(months).toHaveLength(12);
    expect(months.reduce((a, b) => a + b, 0)).toBe(countWorkingDays(cal, "2026-01-01", "2026-12-31"));
    // 2026 punya 261 hari Senin–Jumat; 3 libur di hari kerja
    expect(countWorkingDays(cal, "2026-01-01", "2026-12-31")).toBe(258);
    expect(months[1]).toBe(20);
  });

  it("tanpa hari kerja → 0", () => {
    expect(countWorkingDays(calendar([]), "2026-01-01", "2026-12-31")).toBe(0);
  });
});

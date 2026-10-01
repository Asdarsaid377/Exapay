import { type AttendanceDeductionRules, NO_ATTENDANCE_DEDUCTION_RULES, type Weekday } from "@exapay/shared";
import { describe, expect, it } from "vitest";

import { deductionFacts } from "../src/modules/attendance/attendance-deduction-facts.js";
import { rulesForPeriod, type RuleVersionPeriod } from "../src/modules/attendance/attendance-deduction-rules.js";
import { recapEmployee } from "../src/modules/attendance/attendance-recap.js";
import { countWorkingDays, type WorkCalendar } from "../src/modules/attendance/work-calendar.js";

// Verifikasi feature 27: input absensi payroll — versi aturan per periode & fakta masa kerja (murni, tanpa DB).

const FIXED_50K: AttendanceDeductionRules = { ...NO_ATTENDANCE_DEDUCTION_RULES, absence: { mode: "fixed_per_day", amountPerDay: "50000.00" } };
const FIXED_75K: AttendanceDeductionRules = { ...NO_ATTENDANCE_DEDUCTION_RULES, absence: { mode: "fixed_per_day", amountPerDay: "75000.00" } };

describe("rulesForPeriod", () => {
  const versions: RuleVersionPeriod[] = [
    { effectiveFrom: "2026-10-15", effectiveTo: null, rules: FIXED_75K },
    { effectiveFrom: "2026-09-10", effectiveTo: "2026-10-14", rules: FIXED_50K },
  ];

  it("tanpa versi → tanpa potongan", () => {
    expect(rulesForPeriod([], "2026-10-01", "2026-10-31")).toEqual({ rules: NO_ATTENDANCE_DEDUCTION_RULES, changedOn: null });
  });

  it("versi yang berlaku di hari pertama periode dipakai seluruh periode; versi baru di tengah periode dilaporkan", () => {
    expect(rulesForPeriod(versions, "2026-10-01", "2026-10-31")).toEqual({ rules: FIXED_50K, changedOn: "2026-10-15" });
  });

  it("periode berikutnya memakai versi baru", () => {
    expect(rulesForPeriod(versions, "2026-11-01", "2026-11-30")).toEqual({ rules: FIXED_75K, changedOn: null });
  });

  it("versi pertama mulai di tengah periode → periode itu tanpa potongan", () => {
    expect(rulesForPeriod(versions, "2026-09-01", "2026-09-30")).toEqual({ rules: NO_ATTENDANCE_DEDUCTION_RULES, changedOn: "2026-09-10" });
  });

  it("versi mulai tepat di hari pertama periode → dipakai, bukan perubahan", () => {
    expect(rulesForPeriod(versions, "2026-10-15", "2026-11-14")).toEqual({ rules: FIXED_75K, changedOn: null });
  });
});

describe("deductionFacts — hari kerja masa kerja", () => {
  const MON_FRI: WorkCalendar = { workdays: new Set<Weekday>([1, 2, 3, 4, 5]), holidays: new Set<string>(["2026-10-07"]) };
  const from = "2026-10-01";
  const to = "2026-10-31";

  function factsFor(joinDate: string, endDate: string | null) {
    const recap = recapEmployee({ calendar: MON_FRI, from, to, today: "2026-11-02", employment: { joinDate, endDate }, records: [], leaves: [] });
    return deductionFacts({ days: recap.days, records: [], leaves: [], periodWorkingDays: countWorkingDays(MON_FRI, from, to) });
  }

  it("bekerja sepanjang periode → sama dengan hari kerja periode", () => {
    // Okt 2026: 22 hari Senin–Jumat − libur Rabu 7 Okt = 21
    expect(factsFor("2025-01-01", null)).toMatchObject({ periodWorkingDays: 21, employedWorkingDays: 21, absentDays: 21 });
  });

  it("masuk di tengah periode: hari sebelum tanggal masuk tidak dihitung", () => {
    // Masuk Senin 19 Okt → 19–30 Okt = 10 hari kerja
    expect(factsFor("2026-10-19", null)).toMatchObject({ periodWorkingDays: 21, employedWorkingDays: 10, absentDays: 10 });
  });

  it("keluar di tengah periode: tanggal keluar ikut dihitung", () => {
    // Keluar Kamis 8 Okt → 1, 2, 5, 6, 8 Okt (7 Okt libur) = 5 hari kerja
    expect(factsFor("2025-01-01", "2026-10-08")).toMatchObject({ employedWorkingDays: 5, absentDays: 5 });
  });
});

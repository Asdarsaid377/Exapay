import type { Weekday } from "@exapay/shared";
import { describe, expect, it } from "vitest";

import { deductionFacts } from "../src/modules/attendance/attendance-deduction-facts.js";
import { recapEmployee, type RecapRecord } from "../src/modules/attendance/attendance-recap.js";
import { matchCheckIn, openOvernightDate, type ShiftDayFacts, type ShiftTimes } from "../src/modules/attendance/shift-attendance.js";
import {
  countPlannedWorkingDays,
  countWorkingDays,
  isWorkingDay,
  type WorkCalendar,
  weeklyWorkingDays,
} from "../src/modules/attendance/work-calendar.js";
import { kpiScore, type ScoreIndicator } from "../src/modules/kpi/kpi-score.js";

// Verifikasi feature 47 (murni): pencocokan absen ke shift (2 jam sebelum mulai, telat dari jam shift, shift malam di tanggal
// mulai), hari kerja roster untuk rekap/alpa, pembagi potongan & target KPI. Zona waktu Makassar (WITA = UTC+8).

const TZ = "Asia/Makassar";
const PAGI: ShiftTimes = { name: "Pagi", startTime: "07:00", endTime: "15:00" };
const MALAM: ShiftTimes = { name: "Malam", startTime: "22:00", endTime: "06:00" };
const DINI: ShiftTimes = { name: "Dini", startTime: "00:30", endTime: "08:30" };

// Jam lokal WITA → instant
const wita = (date: string, time: string): Date => new Date(`${date}T${time}:00+08:00`);

function facts(roster: Record<string, ShiftTimes | "off">, records: Record<string, { checkedOut: boolean; start?: string; end?: string }> = {}): ShiftDayFacts {
  return {
    roster: new Map(Object.entries(roster)),
    records: new Map(
      Object.entries(records).map(([date, r]) => [date, { checkedOut: r.checkedOut, scheduledStart: r.start ?? null, scheduledEnd: r.end ?? null }]),
    ),
  };
}

describe("matchCheckIn", () => {
  it("shift hari ini: dibuka 2 jam sebelum mulai, lebih awal ditolak, telat dari jam mulai shift", () => {
    const roster = facts({ "2026-10-05": PAGI });
    const early = matchCheckIn(wita("2026-10-05", "04:59"), "2026-10-05", TZ, roster);
    expect(early).toMatchObject({ kind: "too_early", shift: { workDate: "2026-10-05", name: "Pagi" } });
    expect(early.kind === "too_early" && early.opensAt.toISOString()).toBe(wita("2026-10-05", "05:00").toISOString());
    expect(matchCheckIn(wita("2026-10-05", "05:00"), "2026-10-05", TZ, roster)).toMatchObject({ kind: "shift", lateMinutes: 0 });
    expect(matchCheckIn(wita("2026-10-05", "07:00"), "2026-10-05", TZ, roster)).toMatchObject({ kind: "shift", lateMinutes: 0 });
    expect(matchCheckIn(wita("2026-10-05", "07:14"), "2026-10-05", TZ, roster)).toMatchObject({ kind: "shift", lateMinutes: 14 });
    // Sangat telat (setelah shift selesai) tetap dicocokkan ke shift hari ini
    expect(matchCheckIn(wita("2026-10-05", "16:00"), "2026-10-05", TZ, roster)).toMatchObject({ kind: "shift", lateMinutes: 540 });
  });

  it("shift malam dihitung di tanggal mulai: masuk sebelum & sesudah tengah malam", () => {
    const roster = facts({ "2026-10-06": MALAM });
    expect(matchCheckIn(wita("2026-10-06", "21:55"), "2026-10-06", TZ, roster)).toMatchObject({
      kind: "shift",
      shift: { workDate: "2026-10-06" },
      lateMinutes: 0,
    });
    // 00:40 tanggal 7 → masih shift malam tanggal 6, telat 160 menit
    expect(matchCheckIn(wita("2026-10-07", "00:40"), "2026-10-07", TZ, roster)).toMatchObject({
      kind: "shift",
      shift: { workDate: "2026-10-06" },
      lateMinutes: 160,
    });
    // Setelah shift malam selesai & tanpa shift hari ini → tanpa jadwal di tanggal hari ini
    expect(matchCheckIn(wita("2026-10-07", "06:30"), "2026-10-07", TZ, roster)).toEqual({ kind: "unscheduled", workDate: "2026-10-07" });
  });

  it("shift besok yang mulai lewat tengah malam bisa diabsen 2 jam sebelumnya", () => {
    const roster = facts({ "2026-10-08": DINI });
    expect(matchCheckIn(wita("2026-10-07", "23:00"), "2026-10-07", TZ, roster)).toMatchObject({ kind: "shift", shift: { workDate: "2026-10-08" } });
    expect(matchCheckIn(wita("2026-10-07", "22:00"), "2026-10-07", TZ, roster)).toEqual({ kind: "unscheduled", workDate: "2026-10-07" });
  });

  it("hari libur / belum diatur → tanpa jadwal; shift yang sudah diabsen tidak dicocokkan lagi", () => {
    expect(matchCheckIn(wita("2026-10-06", "10:00"), "2026-10-06", TZ, facts({ "2026-10-06": "off" }))).toEqual({ kind: "unscheduled", workDate: "2026-10-06" });
    expect(matchCheckIn(wita("2026-10-06", "10:00"), "2026-10-06", TZ, facts({}))).toEqual({ kind: "unscheduled", workDate: "2026-10-06" });
    const attended = facts({ "2026-10-05": PAGI }, { "2026-10-05": { checkedOut: true, start: "07:00", end: "15:00" } });
    // Sudah absen → pencocokan jatuh ke tanggal hari ini (insert ditolak unik: "sudah absen masuk hari ini")
    expect(matchCheckIn(wita("2026-10-05", "15:30"), "2026-10-05", TZ, attended)).toEqual({ kind: "unscheduled", workDate: "2026-10-05" });
  });

  it("pulang shift malam berdekatan dengan shift pagi: jam mulai terdekat menang", () => {
    // Malam tgl 6 belum diabsen, Pagi tgl 7: pukul 05:30 tgl 7 lebih dekat ke Pagi (07:00) daripada Malam (22:00 kemarin)
    const roster = facts({ "2026-10-06": MALAM, "2026-10-07": PAGI });
    expect(matchCheckIn(wita("2026-10-07", "05:30"), "2026-10-07", TZ, roster)).toMatchObject({ kind: "shift", shift: { workDate: "2026-10-07" } });
  });
});

describe("openOvernightDate", () => {
  const malamOpen = facts({ "2026-10-06": MALAM }, { "2026-10-06": { checkedOut: false, start: "22:00", end: "06:00" } });

  it("absen shift malam yang belum pulang tetap kartu aktif keesokan hari", () => {
    expect(openOvernightDate(wita("2026-10-07", "06:05"), "2026-10-07", TZ, malamOpen)).toBe("2026-10-06");
    // Paling lama 12 jam setelah shift selesai
    expect(openOvernightDate(wita("2026-10-07", "18:01"), "2026-10-07", TZ, malamOpen)).toBeNull();
  });

  it("berhenti saat shift hari ini mulai, sudah pulang, atau shift bukan malam", () => {
    const withPagi = facts({ "2026-10-06": MALAM, "2026-10-07": PAGI }, { "2026-10-06": { checkedOut: false, start: "22:00", end: "06:00" } });
    expect(openOvernightDate(wita("2026-10-07", "06:50"), "2026-10-07", TZ, withPagi)).toBe("2026-10-06");
    expect(openOvernightDate(wita("2026-10-07", "07:00"), "2026-10-07", TZ, withPagi)).toBeNull();
    const closed = facts({ "2026-10-06": MALAM }, { "2026-10-06": { checkedOut: true, start: "22:00", end: "06:00" } });
    expect(openOvernightDate(wita("2026-10-07", "06:05"), "2026-10-07", TZ, closed)).toBeNull();
    const day = facts({ "2026-10-06": PAGI }, { "2026-10-06": { checkedOut: false, start: "07:00", end: "15:00" } });
    expect(openOvernightDate(wita("2026-10-07", "06:05"), "2026-10-07", TZ, day)).toBeNull();
  });
});

// Kalender usaha Sen–Jum, 1 Okt libur. Roster karyawan: shift Sab 3, Min 4, Sen 5, Rab 7 Okt; libur Sel 6; selebihnya belum diatur.
const BUSINESS: WorkCalendar = { workdays: new Set<Weekday>([1, 2, 3, 4, 5]), holidays: new Set(["2026-10-01"]) };
const ROSTER: WorkCalendar = {
  ...BUSINESS,
  roster: {
    since: "2026-09-01",
    shiftDates: new Set(["2026-10-01", "2026-10-03", "2026-10-04", "2026-10-05", "2026-10-07"]),
    offDates: new Set(["2026-10-06"]),
  },
};

describe("kalender kerja roster", () => {
  it("hari kerja = hari ber-shift (libur usaha & jadwal mingguan tidak berlaku); tanpa roster sama dengan sebelumnya", () => {
    expect(isWorkingDay(ROSTER, "2026-10-01")).toBe(true);
    expect(isWorkingDay(ROSTER, "2026-10-04")).toBe(true);
    expect(isWorkingDay(ROSTER, "2026-10-02")).toBe(false);
    expect(countWorkingDays(ROSTER, "2026-10-01", "2026-10-07")).toBe(5);
    expect(countWorkingDays(BUSINESS, "2026-10-01", "2026-10-07")).toBe(4);
    expect(countPlannedWorkingDays(BUSINESS, "2026-10-01", "2026-10-31")).toBe(countWorkingDays(BUSINESS, "2026-10-01", "2026-10-31"));
    expect(weeklyWorkingDays(BUSINESS, "2026-10-07")).toBe(5);
  });

  it("sebelum roster pertama karyawan tetap kalender usaha (pindah mode tidak mengubah hari lampau)", () => {
    const switched: WorkCalendar = { ...ROSTER, roster: { ...ROSTER.roster!, since: "2026-10-03" } };
    // 1 Okt libur usaha, 2 Okt Jum hari kerja usaha; mulai 3 Okt roster
    expect(isWorkingDay(switched, "2026-10-01")).toBe(false);
    expect(isWorkingDay(switched, "2026-10-02")).toBe(true);
    expect(isWorkingDay(switched, "2026-10-04")).toBe(true);
    expect(countWorkingDays(switched, "2026-09-28", "2026-10-07")).toBe(3 + 1 + 4);
    expect(countPlannedWorkingDays(switched, "2026-09-28", "2026-10-07")).toBe(8);
  });

  it("perkiraan pembagi: tanggal belum diatur mengikuti jadwal usaha", () => {
    // 1–7 Okt: shift 1,3,4,5,7 (5) + belum diatur 2 (Jum, hari kerja) = 6
    expect(countPlannedWorkingDays(ROSTER, "2026-10-01", "2026-10-07")).toBe(6);
    // Minggu 5–11 Okt: shift 5,7 + belum diatur 8,9 (Kam, Jum) = 4
    expect(weeklyWorkingDays(ROSTER, "2026-10-09")).toBe(4);
  });

  it("rekap: alpa hanya di hari ber-shift yang lewat; hari tanpa shift libur; absen di hari tanpa shift = hadir di luar jadwal", () => {
    const records: RecapRecord[] = [
      { workDate: "2026-10-03", lateMinutes: 9, hasCheckOut: true },
      { workDate: "2026-10-06", lateMinutes: 0, hasCheckOut: true },
    ];
    const recap = recapEmployee({
      calendar: ROSTER,
      from: "2026-10-01",
      to: "2026-10-07",
      today: "2026-10-07",
      employment: { joinDate: "2025-01-01", endDate: null },
      records,
      leaves: [{ type: "sick", startDate: "2026-10-04", endDate: "2026-10-04" }],
    });
    expect(recap.days.map((day) => day.status)).toEqual(["absent", "off", "late", "sick", "absent", "off_day_present", "pending"]);
    expect(recap.summary).toMatchObject({ workingDays: 5, present: 1, late: 1, absent: 2, sick: 1, offDayPresent: 1 });

    const deduction = deductionFacts({ days: recap.days, records, leaves: [], periodWorkingDays: countPlannedWorkingDays(ROSTER, "2026-10-01", "2026-10-07") });
    expect(deduction).toMatchObject({ periodWorkingDays: 6, employedWorkingDays: 5, absentDays: 2, lateMinutes: [9], sickDays: 1 });
  });

  it("prorata KPI bulanan & mingguan memakai hari roster", () => {
    // Oktober: shift 1,3,4,5,7 + belum diatur Sen–Jum 8–31 (kecuali libur) = 5 + 18 = 23 hari perkiraan
    expect(countPlannedWorkingDays(ROSTER, "2026-10-01", "2026-10-31")).toBe(23);
    const monthly: ScoreIndicator = { id: "m", name: "Penjualan", type: "numeric", unit: "Rp", target: "2300000", targetPeriod: "monthly", systemMetric: null, weight: 50 };
    const weekly: ScoreIndicator = { id: "w", name: "Kunjungan", type: "count", unit: "kunjungan", target: "8", targetPeriod: "weekly", systemMetric: null, weight: 50 };
    const days = [
      { date: "2026-10-03", status: "on_time" as const },
      { date: "2026-10-04", status: "on_time" as const },
      { date: "2026-10-05", status: "on_time" as const },
    ];
    const result = kpiScore({ calendar: ROSTER, days, indicators: [monthly, weekly], actuals: new Map(), ratings: new Map() });
    // Bulanan 3 × 2.300.000/23 = 300.000. Mingguan: 3–4 Okt di minggu 28 Sep–4 Okt (shift 1,3,4 + belum diatur 28,29,30 Sep, 2 Okt
    // = 7 → 8/7 per hari); 5 Okt di minggu 5–11 Okt (4 → 2) → 2 × 8/7 + 2 = 4,29
    expect(result.indicators.map((indicator) => indicator.periodTarget)).toEqual(["300000", "4.29"]);
  });
});

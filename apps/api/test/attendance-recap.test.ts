import type { Weekday } from "@exapay/shared";
import { describe, expect, it } from "vitest";

import { zonedInstant } from "../src/modules/attendance/attendance-clock.js";
import { recapEmployee, type RecapInput } from "../src/modules/attendance/attendance-recap.js";
import type { WorkCalendar } from "../src/modules/attendance/work-calendar.js";

// Verifikasi feature 16: klasifikasi harian & rekap satu karyawan (murni, tanpa DB).

const MON_FRI: WorkCalendar = { workdays: new Set<Weekday>([1, 2, 3, 4, 5]), holidays: new Set<string>() };

// Senin 5 Okt – Minggu 11 Okt 2026, hari ini Jumat 9 Okt
function input(overrides: Partial<RecapInput> = {}): RecapInput {
  return {
    calendar: MON_FRI,
    from: "2026-10-05",
    to: "2026-10-11",
    today: "2026-10-09",
    employment: { joinDate: "2025-01-01", endDate: null },
    records: [],
    leaves: [],
    ...overrides,
  };
}

describe("recapEmployee", () => {
  it("hari kerja lewat tanpa absen = alpa; hari ini & akhir pekan tidak", () => {
    const result = recapEmployee(input());
    expect(result.days.map((d) => d.status)).toEqual(["absent", "absent", "absent", "absent", "pending", "off", "off"]);
    expect(result.summary).toMatchObject({ workingDays: 5, present: 0, absent: 4 });
  });

  it("hadir tepat waktu, telat (jumlah & menit), dan tanpa absen pulang", () => {
    const result = recapEmployee(
      input({
        records: [
          { workDate: "2026-10-05", lateMinutes: 0, hasCheckOut: true },
          { workDate: "2026-10-06", lateMinutes: 12, hasCheckOut: true },
          { workDate: "2026-10-07", lateMinutes: 3, hasCheckOut: false },
          // Hari ini belum pulang — belum dihitung "tanpa absen pulang"
          { workDate: "2026-10-09", lateMinutes: 0, hasCheckOut: false },
        ],
      }),
    );
    expect(result.days.slice(0, 5).map((d) => d.status)).toEqual(["on_time", "late", "late", "absent", "on_time"]);
    expect(result.summary).toMatchObject({ present: 4, late: 2, lateMinutes: 15, absent: 1, missingCheckOut: 1 });
  });

  it("izin disetujui menutup hari kerja (bukan alpa), akhir pekan di dalam rentang tidak dihitung", () => {
    const result = recapEmployee(
      input({
        records: [{ workDate: "2026-10-05", lateMinutes: 0, hasCheckOut: true }],
        leaves: [
          { type: "sick", startDate: "2026-10-06", endDate: "2026-10-07" },
          { type: "leave", startDate: "2026-10-08", endDate: "2026-10-12" },
        ],
      }),
    );
    expect(result.days.map((d) => d.status)).toEqual(["on_time", "sick", "sick", "leave", "leave", "off", "off"]);
    expect(result.summary).toMatchObject({ present: 1, sick: 2, leave: 2, absent: 0 });
  });

  it("absen tetap menang atas izin di tanggal yang sama", () => {
    const result = recapEmployee(
      input({ records: [{ workDate: "2026-10-05", lateMinutes: 0, hasCheckOut: true }], leaves: [{ type: "permit", startDate: "2026-10-05", endDate: "2026-10-05" }] }),
    );
    expect(result.days[0]?.status).toBe("on_time");
    expect(result.summary.permit).toBe(0);
  });

  it("libur usaha bukan hari kerja; absen di hari libur/akhir pekan = off_day_present", () => {
    const calendar: WorkCalendar = { workdays: MON_FRI.workdays, holidays: new Set(["2026-10-06"]) };
    const result = recapEmployee(
      input({
        calendar,
        records: [
          { workDate: "2026-10-06", lateMinutes: 0, hasCheckOut: true },
          { workDate: "2026-10-10", lateMinutes: 0, hasCheckOut: true },
        ],
      }),
    );
    expect(result.days.map((d) => d.status)).toEqual(["absent", "off_day_present", "absent", "absent", "pending", "off_day_present", "off"]);
    expect(result.summary).toMatchObject({ workingDays: 4, present: 0, offDayPresent: 2, absent: 3 });
  });

  it("hari di luar masa kerja tidak dihitung (masuk Rabu, keluar Kamis inklusif)", () => {
    const result = recapEmployee(input({ today: "2026-10-12", employment: { joinDate: "2026-10-07", endDate: "2026-10-08" } }));
    expect(result.days.map((d) => d.status)).toEqual(["not_employed", "not_employed", "absent", "absent", "not_employed", "not_employed", "not_employed"]);
    expect(result.summary).toMatchObject({ workingDays: 2, absent: 2 });
  });
});

describe("zonedInstant", () => {
  it("jam lokal WIB/WITA/WIT → instant UTC", () => {
    expect(zonedInstant("2026-10-05", "08:00", "Asia/Jakarta").toISOString()).toBe("2026-10-05T01:00:00.000Z");
    expect(zonedInstant("2026-10-05", "08:00", "Asia/Makassar").toISOString()).toBe("2026-10-05T00:00:00.000Z");
    expect(zonedInstant("2026-10-05", "06:30", "Asia/Jayapura").toISOString()).toBe("2026-10-04T21:30:00.000Z");
  });

  it("zona dengan DST tetap benar", () => {
    // Eropa/Berlin: 5 Okt masih CEST (+2), 5 Des CET (+1)
    expect(zonedInstant("2026-10-05", "08:00", "Europe/Berlin").toISOString()).toBe("2026-10-05T06:00:00.000Z");
    expect(zonedInstant("2026-12-05", "08:00", "Europe/Berlin").toISOString()).toBe("2026-12-05T07:00:00.000Z");
  });
});

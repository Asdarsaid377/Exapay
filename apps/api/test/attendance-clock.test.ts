import { describe, expect, it } from "vitest";

import { lateMinutes, localClock, minutesOfDay, monthRange } from "../src/modules/attendance/attendance-clock.js";

// Verifikasi feature 14: jam lokal usaha & hitung telat (murni, tanpa DB).

describe("localClock", () => {
  it("tanggal & jam mengikuti zona waktu usaha (WIB/WITA/WIT)", () => {
    const instant = new Date("2026-10-05T00:12:30Z");
    expect(localClock(instant, "Asia/Jakarta")).toEqual({ date: "2026-10-05", minutes: 7 * 60 + 12 });
    expect(localClock(instant, "Asia/Makassar")).toEqual({ date: "2026-10-05", minutes: 8 * 60 + 12 });
    expect(localClock(instant, "Asia/Jayapura")).toEqual({ date: "2026-10-05", minutes: 9 * 60 + 12 });
  });

  it("tanggal kerja berganti di tengah malam lokal, bukan UTC", () => {
    // 17:30 UTC 4 Okt = 00:30 WIB 5 Okt
    expect(localClock(new Date("2026-10-04T17:30:00Z"), "Asia/Jakarta")).toEqual({ date: "2026-10-05", minutes: 30 });
    // 16:59 UTC = 23:59 WIB, masih 4 Okt
    expect(localClock(new Date("2026-10-04T16:59:59Z"), "Asia/Jakarta")).toEqual({ date: "2026-10-04", minutes: 23 * 60 + 59 });
    // Tengah malam = 0 (bukan 24)
    expect(localClock(new Date("2026-10-04T17:00:00Z"), "Asia/Jakarta")).toEqual({ date: "2026-10-05", minutes: 0 });
  });
});

describe("lateMinutes", () => {
  it("menit penuh setelah jam masuk; detik diabaikan", () => {
    expect(lateMinutes(minutesOfDay("07:52"), "08:00")).toBe(0);
    // 08:00:59 dibaca 08:00 → tepat waktu
    expect(lateMinutes(localClock(new Date("2026-10-05T01:00:59Z"), "Asia/Jakarta").minutes, "08:00")).toBe(0);
    expect(lateMinutes(minutesOfDay("08:01"), "08:00")).toBe(1);
    expect(lateMinutes(minutesOfDay("09:30"), "08:00:00")).toBe(90);
  });

  it("tanpa jadwal (bukan hari kerja) tidak pernah telat", () => {
    expect(lateMinutes(minutesOfDay("13:00"), null)).toBe(0);
  });
});

describe("monthRange", () => {
  it("hari terakhir bulan termasuk Februari kabisat", () => {
    expect(monthRange("2026-09")).toEqual({ from: "2026-09-01", to: "2026-09-30" });
    expect(monthRange("2026-02")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(monthRange("2028-02")).toEqual({ from: "2028-02-01", to: "2028-02-29" });
    expect(monthRange("2026-12")).toEqual({ from: "2026-12-01", to: "2026-12-31" });
  });
});

import { isOvernightShift, shiftDurationMinutes, workShiftInputSchema } from "@exapay/shared";
import { describe, expect, it } from "vitest";

import { addDays, rosterEntryOf, rosterEntryText, rosterLockReason, weekDates, weekStartOf } from "../src/modules/attendance/shift-roster.js";

// Aturan roster shift (feature 46) — fungsi murni

const base = { today: "2026-10-05", joinDate: "2025-01-01", endDate: null, attended: false, finalRanges: [] };

describe("minggu roster", () => {
  it("Senin sebagai awal minggu, termasuk dari Minggu & lintas bulan/tahun", () => {
    expect(weekStartOf("2026-10-05")).toBe("2026-10-05");
    expect(weekStartOf("2026-10-11")).toBe("2026-10-05");
    expect(weekStartOf("2026-10-01")).toBe("2026-09-28");
    expect(weekStartOf("2027-01-02")).toBe("2026-12-28");
    expect(weekDates("2026-09-28")).toEqual(["2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"]);
    expect(addDays("2026-10-05", -7)).toBe("2026-09-28");
  });
});

describe("shift melewati tengah malam", () => {
  it("selesai ≤ mulai = keesokan hari; durasi benar", () => {
    expect(isOvernightShift("07:00", "15:00")).toBe(false);
    expect(isOvernightShift("22:00", "06:00")).toBe(true);
    expect(shiftDurationMinutes("22:00", "06:00")).toBe(480);
    expect(shiftDurationMinutes("15:00", "23:00")).toBe(480);
    expect(shiftDurationMinutes("23:30", "00:15")).toBe(45);
  });

  it("jam mulai = selesai ditolak", () => {
    expect(workShiftInputSchema.safeParse({ name: "Aneh", startTime: "08:00", endTime: "08:00" }).success).toBe(false);
    expect(workShiftInputSchema.safeParse({ name: "Malam", startTime: "22:00", endTime: "06:00" }).success).toBe(true);
    expect(workShiftInputSchema.safeParse({ name: "Salah", startTime: "24:00", endTime: "06:00" }).success).toBe(false);
  });
});

describe("kunci sel roster", () => {
  it("hari ini & ke depan bebas; lewat, sudah absen, periode final, di luar masa kerja terkunci", () => {
    expect(rosterLockReason("2026-10-05", base)).toBeNull();
    expect(rosterLockReason("2026-10-20", base)).toBeNull();
    expect(rosterLockReason("2026-10-04", base)).toBe("past");
    expect(rosterLockReason("2026-10-05", { ...base, attended: true })).toBe("attended");
    expect(rosterLockReason("2026-10-07", { ...base, finalRanges: [{ from: "2026-09-26", to: "2026-10-25" }] })).toBe("payroll_final");
    expect(rosterLockReason("2026-10-26", { ...base, finalRanges: [{ from: "2026-09-26", to: "2026-10-25" }] })).toBeNull();
    expect(rosterLockReason("2026-10-07", { ...base, joinDate: "2026-10-08" })).toBe("not_employed");
    expect(rosterLockReason("2026-10-07", { ...base, endDate: "2026-10-06" })).toBe("not_employed");
  });
});

describe("isi sel", () => {
  it("snapshot shift / libur / belum diatur", () => {
    const night = rosterEntryOf({ workShiftId: null, shiftName: "Malam", startTime: "22:00:00", endTime: "06:00:00" });
    expect(night).toEqual({ kind: "shift", shiftId: null, name: "Malam", startTime: "22:00", endTime: "06:00", overnight: true });
    expect(rosterEntryText(night)).toBe("Malam 22:00–06:00 (+1)");
    expect(rosterEntryText(rosterEntryOf({ workShiftId: null, shiftName: null, startTime: null, endTime: null }))).toBe("Libur");
    expect(rosterEntryText(null)).toBe("—");
  });
});

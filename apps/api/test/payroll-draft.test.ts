import { describe, expect, it } from "vitest";

import { type DraftSalaryVersion, lastPaidDate, salaryVersionForPeriod } from "../src/modules/payroll/payroll-draft.js";

// Pemilihan versi gaji untuk draf payroll (feature 29): versi yang berlaku di hari terakhir yang dibayar.

function version(id: string, effectiveFrom: string, effectiveTo: string | null): DraftSalaryVersion {
  return { id, effectiveFrom, effectiveTo, items: [], bpjsPrograms: [] };
}

const FROM = "2026-10-01";
const TO = "2026-10-31";
const LONG_TIME = { joinDate: "2025-01-01", endDate: null };

describe("salaryVersionForPeriod", () => {
  it("versi yang berlaku sepanjang periode → tanpa peringatan", () => {
    const result = salaryVersionForPeriod([version("a", "2025-01-01", null)], FROM, TO, LONG_TIME);
    expect(result).toEqual({ version: expect.objectContaining({ id: "a" }), changedOn: null });
  });

  it("gaji naik tanggal 15 → versi baru untuk seluruh periode + tanggal perubahan", () => {
    const versions = [version("lama", "2025-01-01", "2026-10-14"), version("baru", "2026-10-15", null)];
    expect(salaryVersionForPeriod(versions, FROM, TO, LONG_TIME)).toEqual({ version: expect.objectContaining({ id: "baru" }), changedOn: "2026-10-15" });
  });

  it("versi baru mulai tanggal 1 bukan perubahan di tengah periode", () => {
    const versions = [version("lama", "2025-01-01", "2026-09-30"), version("baru", "2026-10-01", null)];
    expect(salaryVersionForPeriod(versions, FROM, TO, LONG_TIME).changedOn).toBeNull();
  });

  it("karyawan baru: gaji mulai tanggal masuk bukan perubahan", () => {
    const result = salaryVersionForPeriod([version("a", "2026-10-15", null)], FROM, TO, { joinDate: "2026-10-15", endDate: null });
    expect(result.changedOn).toBeNull();
  });

  it("karyawan keluar: versi yang berlaku di hari terakhir bekerja (versi terjadwal sesudahnya diabaikan)", () => {
    const versions = [version("lama", "2025-01-01", "2026-10-19"), version("baru", "2026-10-20", null)];
    const result = salaryVersionForPeriod(versions, FROM, TO, { joinDate: "2025-01-01", endDate: "2026-10-16" });
    expect(result).toEqual({ version: expect.objectContaining({ id: "lama" }), changedOn: null });
  });

  it("gaji baru mulai setelah periode → belum ada gaji", () => {
    expect(salaryVersionForPeriod([version("a", "2026-11-01", null)], FROM, TO, LONG_TIME).version).toBeNull();
  });
});

describe("lastPaidDate", () => {
  it("akhir bulan, atau tanggal keluar bila lebih awal", () => {
    expect(lastPaidDate(TO, null)).toBe(TO);
    expect(lastPaidDate(TO, "2026-10-16")).toBe("2026-10-16");
    expect(lastPaidDate(TO, "2026-12-31")).toBe(TO);
  });
});

import type { MinimumWageReference } from "@exapay/shared";
import { describe, expect, it } from "vitest";

import { type MinimumWageCheckEmployee, minimumWageFlagOf } from "../src/modules/payroll/minimum-wage-check.js";

// Peringatan upah minimum (feature 34) — fungsi murni. Upah = gaji pokok + tunjangan tetap (dijumlah di DB).

const TODAY = "2026-10-05";
const UMK_2026: MinimumWageReference = { scope: "regency", areaName: "Kota Makassar", monthlyAmount: "3921088.00", effectiveFrom: "2026-01-01", effectiveTo: "2026-12-31" };
const UMK_2027: MinimumWageReference = { scope: "regency", areaName: "Kota Makassar", monthlyAmount: "4200000.00", effectiveFrom: "2027-01-01", effectiveTo: null };

function employee(wage: string, extra: Partial<MinimumWageCheckEmployee> = {}): MinimumWageCheckEmployee {
  return { joinDate: "2025-01-01", endDate: null, salaryVersions: [{ effectiveFrom: "2025-01-01", effectiveTo: null, wage }], ...extra };
}

describe("minimumWageFlagOf", () => {
  it("di bawah upah minimum yang berlaku hari ini → below", () => {
    expect(minimumWageFlagOf(employee("3900000.00"), TODAY, UMK_2026, null)).toEqual({
      status: "below",
      wage: "3900000.00",
      minimumWage: "3921088.00",
      checkedOn: TODAY,
    });
  });

  it("tepat sama dengan upah minimum atau lebih → tidak ditandai (perbandingan desimal, bukan float)", () => {
    expect(minimumWageFlagOf(employee("3921088.00"), TODAY, UMK_2026, null)).toBeNull();
    expect(minimumWageFlagOf(employee("3921088.01"), TODAY, UMK_2026, null)).toBeNull();
    expect(minimumWageFlagOf(employee("3921087.99"), TODAY, UMK_2026, null)?.status).toBe("below");
  });

  it("patuh sekarang tetapi di bawah versi berikutnya → below_upcoming pada tanggal mulai berlakunya", () => {
    expect(minimumWageFlagOf(employee("4000000.00"), TODAY, UMK_2026, UMK_2027)).toEqual({
      status: "below_upcoming",
      wage: "4000000.00",
      minimumWage: "4200000.00",
      checkedOn: "2027-01-01",
    });
    // Di bawah keduanya → yang berlaku sekarang didahulukan
    expect(minimumWageFlagOf(employee("3500000.00"), TODAY, UMK_2026, UMK_2027)?.status).toBe("below");
  });

  it("kenaikan gaji yang sudah dijadwalkan ikut diperhitungkan", () => {
    const raised = employee("", {
      salaryVersions: [
        { effectiveFrom: "2025-01-01", effectiveTo: "2026-12-31", wage: "4000000.00" },
        { effectiveFrom: "2027-01-01", effectiveTo: null, wage: "4250000.00" },
      ],
    });
    expect(minimumWageFlagOf(raised, TODAY, UMK_2026, UMK_2027)).toBeNull();
  });

  it("gaji belum diatur, atau karyawan keluar sebelum tanggal pembanding → tidak ditandai", () => {
    expect(minimumWageFlagOf(employee("", { salaryVersions: [] }), TODAY, UMK_2026, UMK_2027)).toBeNull();
    // Keluar 31 Des 2026: tidak terkena upah minimum 2027
    expect(minimumWageFlagOf(employee("4000000.00", { endDate: "2026-12-31" }), TODAY, UMK_2026, UMK_2027)).toBeNull();
    // Versi gaji baru mulai bulan depan (tidak ada versi hari ini) → tidak bisa dicek hari ini
    expect(
      minimumWageFlagOf(employee("", { salaryVersions: [{ effectiveFrom: "2026-11-01", effectiveTo: null, wage: "3000000.00" }] }), TODAY, UMK_2026, null),
    ).toBeNull();
  });

  it("karyawan yang baru akan masuk dibandingkan pada tanggal masuknya", () => {
    const future = employee("4000000.00", { joinDate: "2026-11-02", salaryVersions: [{ effectiveFrom: "2026-11-02", effectiveTo: null, wage: "3800000.00" }] });
    expect(minimumWageFlagOf(future, TODAY, UMK_2026, null)).toMatchObject({ status: "below", checkedOn: "2026-11-02" });
    // Masuk setelah versi berikutnya berlaku → dibandingkan dengan versi itu, statusnya below (berlaku saat ia mulai)
    const nextYear = employee("4000000.00", { joinDate: "2027-02-01", salaryVersions: [{ effectiveFrom: "2027-02-01", effectiveTo: null, wage: "4000000.00" }] });
    expect(minimumWageFlagOf(nextYear, TODAY, UMK_2026, UMK_2027)).toMatchObject({ status: "below", minimumWage: "4200000.00", checkedOn: "2027-02-01" });
  });

  it("tanpa data upah minimum → tidak ditandai", () => {
    expect(minimumWageFlagOf(employee("1000000.00"), TODAY, null, null)).toBeNull();
  });
});

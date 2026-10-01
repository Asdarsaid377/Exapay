import type { MinimumWageFlag, MinimumWageReference } from "@exapay/shared";
import { Decimal } from "decimal.js";

// Peringatan upah minimum (feature 34) — fungsi murni, diuji di test/minimum-wage-check.test.ts.

export type MinimumWageSalaryVersion = {
  effectiveFrom: string;
  effectiveTo: string | null;
  // Gaji pokok + tunjangan tetap versi ini (string desimal)
  wage: string;
};

export type MinimumWageCheckEmployee = {
  joinDate: string;
  endDate: string | null;
  salaryVersions: readonly MinimumWageSalaryVersion[];
};

function versionOn(versions: readonly MinimumWageSalaryVersion[], date: string): MinimumWageSalaryVersion | null {
  return versions.find((version) => version.effectiveFrom <= date && (version.effectiveTo === null || version.effectiveTo >= date)) ?? null;
}

function covers(reference: MinimumWageReference, date: string): boolean {
  return reference.effectiveFrom <= date && (reference.effectiveTo === null || reference.effectiveTo >= date);
}

function compare(
  employee: MinimumWageCheckEmployee,
  reference: MinimumWageReference,
  date: string,
  status: MinimumWageFlag["status"],
): MinimumWageFlag | null {
  // Karyawan sudah keluar sebelum tanggal pembanding → tidak relevan
  if (employee.endDate !== null && employee.endDate < date) return null;
  const version = versionOn(employee.salaryVersions, date);
  // Gaji belum diatur → tidak bisa dicek (draf payroll sudah menandai "gaji belum diatur")
  if (!version) return null;
  if (!new Decimal(version.wage).lt(reference.monthlyAmount)) return null;
  return { status, wage: version.wage, minimumWage: reference.monthlyAmount, checkedOn: date };
}

// Tanggal pembanding = hari ini, atau tanggal masuk untuk karyawan yang baru akan mulai bekerja (bila tanggal itu sudah
// masuk masa berlaku versi berikutnya, versi itulah yang dipakai).
// 1) Di bawah upah minimum yang berlaku pada tanggal itu → "below".
// 2) Selain itu, di bawah versi berikutnya (bila sudah ada datanya) pada tanggal mulai berlakunya — memakai versi gaji
//    yang berlaku pada tanggal itu, jadi kenaikan gaji yang sudah dijadwalkan ikut diperhitungkan → "below_upcoming".
export function minimumWageFlagOf(
  employee: MinimumWageCheckEmployee,
  today: string,
  current: MinimumWageReference | null,
  upcoming: MinimumWageReference | null,
): MinimumWageFlag | null {
  const checkDate = employee.joinDate > today ? employee.joinDate : today;
  const effective = upcoming && covers(upcoming, checkDate) ? upcoming : current && covers(current, checkDate) ? current : null;
  if (effective) {
    const flag = compare(employee, effective, checkDate, "below");
    if (flag) return flag;
  }
  if (upcoming && upcoming.effectiveFrom > checkDate) {
    return compare(employee, upcoming, upcoming.effectiveFrom, "below_upcoming");
  }
  return null;
}

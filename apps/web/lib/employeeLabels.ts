import {
  type EmployeeActivityFilter,
  type EmployeeListItem,
  type EmployeeListQuery,
  type EmploymentStatus,
  type Gender,
  type MinimumWageFlag,
  minimumWageLabel,
  type MinimumWageReference,
  type PtkpStatus,
} from "@exapay/shared";

import type { BadgeTone } from "@/components/common/Badge";
import { daysBetween, formatIsoDate } from "@/lib/datetime";

// Teks & warna tampilan data karyawan (/employees)

export const EMPLOYMENT_STATUS_LABELS: Record<EmploymentStatus, string> = {
  permanent: "Tetap",
  contract: "Kontrak",
  probation: "Percobaan",
};

// Badge status kerja (design-tokens "Komponen baru — halaman Karyawan"): netral / info / aksen
export const EMPLOYMENT_STATUS_TONES: Record<EmploymentStatus, BadgeTone> = {
  permanent: "neutral",
  contract: "info",
  probation: "accent",
};

export const ACTIVITY_FILTER_LABELS: Record<EmployeeActivityFilter, string> = {
  active: "Aktif",
  inactive: "Nonaktif",
  all: "Semua",
};

export const GENDER_LABELS: Record<Gender, string> = {
  male: "Laki-laki",
  female: "Perempuan",
};

export const PTKP_LABELS: Record<PtkpStatus, string> = {
  "TK/0": "tidak kawin, tanpa tanggungan",
  "TK/1": "tidak kawin, 1 tanggungan",
  "TK/2": "tidak kawin, 2 tanggungan",
  "TK/3": "tidak kawin, 3 tanggungan",
  "K/0": "kawin, tanpa tanggungan",
  "K/1": "kawin, 1 tanggungan",
  "K/2": "kawin, 2 tanggungan",
  "K/3": "kawin, 3 tanggungan",
};

// Kontrak/percobaan yang berakhir dalam 30 hari ditandai peringatan (sama dengan pengingat kepatuhan)
export const END_DATE_WARNING_DAYS = 30;

export type EmployeeNote = { text: string; warn: boolean } | null;

// Kolom "Keterangan": tanggal keluar, kontrak habis, atau percobaan selesai
export function employeeNote(employee: EmployeeListItem, today: string): EmployeeNote {
  if (employee.endDate) return { text: `Keluar ${formatIsoDate(employee.endDate)}`, warn: false };
  if (employee.employmentStatus === "contract" && employee.contractEndDate) {
    const days = daysBetween(today, employee.contractEndDate);
    const verb = days < 0 ? "berakhir" : "habis";
    return { text: `Kontrak ${verb} ${formatIsoDate(employee.contractEndDate)}`, warn: days <= END_DATE_WARNING_DAYS };
  }
  if (employee.employmentStatus === "probation" && employee.probationEndDate) {
    const days = daysBetween(today, employee.probationEndDate);
    return { text: `Percobaan selesai ${formatIsoDate(employee.probationEndDate)}`, warn: days <= END_DATE_WARNING_DAYS };
  }
  return null;
}

// Upah minimum yang dipakai pembanding sebuah tanda (feature 34): versi berikutnya bila tanggal pembanding sudah
// masuk masa berlakunya, selain itu yang berlaku sekarang
export function minimumWageReferenceOf(
  flag: MinimumWageFlag,
  current: MinimumWageReference | null,
  upcoming: MinimumWageReference | null,
): MinimumWageReference | null {
  return upcoming && flag.checkedOn >= upcoming.effectiveFrom ? upcoming : current;
}

// Keterangan daftar karyawan: "Di bawah UMK 2026" · "Di bawah UMP 2027 mulai 1 Jan 2027"
export function minimumWageNote(
  flag: MinimumWageFlag | undefined,
  current: MinimumWageReference | null,
  upcoming: MinimumWageReference | null,
): EmployeeNote {
  if (!flag) return null;
  const reference = minimumWageReferenceOf(flag, current, upcoming);
  const label = reference ? minimumWageLabel(reference, false) : "upah minimum";
  return { text: flag.status === "below_upcoming" ? `Di bawah ${label} mulai ${formatIsoDate(flag.checkedOn)}` : `Di bawah ${label}`, warn: true };
}

export function initialsOf(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  const letters = parts.length > 1 ? `${parts[0]?.[0] ?? ""}${parts[1]?.[0] ?? ""}` : (parts[0]?.slice(0, 2) ?? "");
  return letters.toUpperCase() || "?";
}

// URL daftar karyawan dengan filter (dipakai filter client & pagination server)
export function employeesHref(filters: Omit<EmployeeListQuery, "page"> & { page?: number }): string {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.departmentId) params.set("departmentId", filters.departmentId);
  if (filters.status) params.set("status", filters.status);
  if (filters.activity !== "active") params.set("activity", filters.activity);
  if (filters.page && filters.page > 1) params.set("page", String(filters.page));
  const query = params.toString();
  return query ? `/employees?${query}` : "/employees";
}

// Tab detail karyawan /employees/[id] (?tab=, feature 37b). Gaji hanya owner/admin.
export const EMPLOYEE_DETAIL_TABS = ["data", "salary", "kpi", "attendance"] as const;
export type EmployeeDetailTab = (typeof EMPLOYEE_DETAIL_TABS)[number];

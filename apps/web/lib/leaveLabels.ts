import type { LeaveRequestFilter, LeaveRequestStatus } from "@exapay/shared";

import type { BadgeTone } from "@/components/common/Badge";

// Teks & tautan pengajuan izin/sakit/cuti (feature 15)

export const LEAVE_STATUS_TONES: Record<LeaveRequestStatus, BadgeTone> = {
  pending: "warning",
  approved: "success",
  rejected: "danger",
  cancelled: "neutral",
};

const DAY = new Intl.DateTimeFormat("id-ID", { day: "numeric", timeZone: "UTC" });
const DAY_MONTH = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", timeZone: "UTC" });
const FULL = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

function utc(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00Z`);
}

// "6 Okt 2026" · "6–8 Okt 2026" · "28 Sep – 2 Okt 2026" · "30 Des 2026 – 2 Jan 2027"
export function formatDateRange(startDate: string, endDate: string): string {
  if (startDate === endDate) return FULL.format(utc(startDate));
  if (startDate.slice(0, 7) === endDate.slice(0, 7)) return `${DAY.format(utc(startDate))}–${FULL.format(utc(endDate))}`;
  if (startDate.slice(0, 4) === endDate.slice(0, 4)) return `${DAY_MONTH.format(utc(startDate))} – ${FULL.format(utc(endDate))}`;
  return `${FULL.format(utc(startDate))} – ${FULL.format(utc(endDate))}`;
}

export function workingDaysLabel(days: number): string {
  return `${days} hari kerja`;
}

// 245_000 → "239 KB", 1_300_000 → "1,2 MB"
export function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toLocaleString("id-ID", { maximumFractionDigits: 1 })} MB`;
}

// Daftar persetujuan; filter bawaan (Menunggu) & halaman 1 tanpa param
export function leaveRequestsHref(status: LeaveRequestFilter, page = 1): string {
  const params = new URLSearchParams();
  if (status !== "pending") params.set("status", status);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `/attendance/requests?${query}` : "/attendance/requests";
}

// Lampiran dibuka lewat Route Handler area masing-masing (proxy menjaga peran per area)
export function staffAttachmentHref(id: string): string {
  return `/attendance/requests/${id}/attachment`;
}

export function myAttachmentHref(id: string): string {
  return `/me/attendance/requests/${id}/attachment`;
}

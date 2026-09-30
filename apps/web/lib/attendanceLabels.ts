import type { AttendanceRecord, AttendanceStatus } from "@exapay/shared";

import type { BadgeTone } from "@/components/common/Badge";

// Teks & format absen portal (/me, /me/attendance)

const MONTH_LABELS = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"] as const;

// "07:52" di zona waktu usaha (format jam seperti desain kartu absen)
export function formatClockTime(date: Date | string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone }).format(new Date(date));
}

// 12 → "12 menit", 75 → "1 jam 15 menit"
export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return [hours ? `${hours} jam` : "", rest || !hours ? `${rest} menit` : ""].filter(Boolean).join(" ");
}

export function attendanceStatusLabel(record: Pick<AttendanceRecord, "status" | "lateMinutes">): string {
  if (record.status === "late") return `Telat ${formatDuration(record.lateMinutes)}`;
  if (record.status === "off_day") return "Di luar hari kerja";
  return "Tepat waktu";
}

export const ATTENDANCE_STATUS_TONES: Record<AttendanceStatus, BadgeTone> = {
  on_time: "success",
  late: "warning",
  off_day: "neutral",
};

// "2026-09" → "September 2026"
export function monthLabel(month: string): string {
  return `${MONTH_LABELS[Number(month.slice(5, 7)) - 1] ?? ""} ${month.slice(0, 4)}`;
}

// Geser bulan YYYY-MM sebanyak delta
export function shiftMonth(month: string, delta: number): string {
  const date = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1 + delta, 1));
  return date.toISOString().slice(0, 7);
}

// Link riwayat absensi; bulan berjalan tanpa param
export function myAttendanceHref(month: string, currentMonth: string): string {
  return month === currentMonth ? "/me/attendance" : `/me/attendance?month=${month}`;
}

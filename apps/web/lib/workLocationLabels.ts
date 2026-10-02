import {
  ATTENDANCE_FLAG_LABELS,
  type AttendanceEvent,
  type AttendanceFlagKind,
  type AttendanceReviewDecision,
  type AttendanceReviewItem,
  type AttendanceReviewListQuery,
  type EmployeeAttendanceSettings,
  type GeofenceResult,
} from "@exapay/shared";

import type { BadgeTone } from "@/components/common/Badge";
import { formatClockTime } from "@/lib/attendanceLabels";

// Teks & tautan lokasi kerja dan tinjauan absensi (feature 44, design settings-locations / attendance-review / geofence-components)

// Badge tanda: warning untuk lokasi meleset, neutral untuk lokasi tidak terbaca (design "AttendanceFlagBadge")
export const FLAG_TONES: Record<AttendanceFlagKind, BadgeTone> = {
  outside: "warning",
  inaccurate: "warning",
  no_location: "neutral",
};

export const DECISION_TONES: Record<AttendanceReviewDecision, BadgeTone> = {
  accepted: "success",
  follow_up: "warning",
};

export function flagLabel(kind: AttendanceFlagKind): string {
  return ATTENDANCE_FLAG_LABELS[kind];
}

// 320 → "320 m", 1240 → "1,2 km"
export function formatDistance(meters: number): string {
  if (meters < 1000) return `${meters.toLocaleString("id-ID")} m`;
  return `${(meters / 1000).toLocaleString("id-ID", { maximumFractionDigits: 1 })} km`;
}

// 12.4 → "±12 m"
export function formatAccuracy(meters: number): string {
  return `±${Math.round(meters).toLocaleString("id-ID")} m`;
}

// Koordinat seperti format tempel aplikasi peta (titik desimal, 5 digit ≈ 1 m): "-5.15672, 119.43628"
export function formatCoordinates(latitude: number, longitude: number): string {
  return `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
}

// Rincian satu baris di bawah badge tanda (generik — jenis baru cukup menambah kasus)
export function flagDetail(flag: AttendanceReviewItem["flag"]): string {
  if (flag.kind === "no_location") return "Lokasi tidak terbaca (izin lokasi ditolak atau GPS mati)";
  const place = flag.locationName ?? "lokasi kerja";
  if (flag.kind === "inaccurate") return `Akurasi ${flag.accuracyM !== null ? formatAccuracy(flag.accuracyM) : "rendah"}, terdekat ${place}`;
  const distance = flag.distanceM !== null ? `${formatDistance(flag.distanceM)} dari ${place}` : `Di luar ${place}`;
  return flag.accuracyM !== null ? `${distance} (akurasi ${formatAccuracy(flag.accuracyM)})` : distance;
}

// "Masuk 07:58" / "Pulang 17:40"
export function eventLabel(event: AttendanceEvent, at: string, timeZone: string): string {
  return `${event === "check_in" ? "Masuk" : "Pulang"} ${formatClockTime(at, timeZone)}`;
}

// Keterangan di kartu absen portal setelah absen bertanda (design me-attendance-location "CheckInLocationNote").
// null = di lokasi / tidak dicek → tanpa keterangan.
export function checkInLocationNote(event: AttendanceEvent, geofence: GeofenceResult | null): { tone: "warning" | "neutral"; text: string } | null {
  if (!geofence || geofence.status === "inside") return null;
  if (geofence.status === "no_location")
    return {
      tone: "neutral",
      text: "Lokasi tidak terbaca. Absen tetap diterima dan akan ditinjau. Izinkan lokasi di pengaturan browser untuk absen berikutnya.",
    };
  if (geofence.status === "inaccurate")
    return {
      tone: "warning",
      text: `Sinyal lokasi lemah (akurasi ${geofence.accuracyM !== null ? formatAccuracy(geofence.accuracyM) : "rendah"}). Absen tetap diterima dan akan ditinjau.`,
    };
  const where = geofence.distanceM !== null && geofence.locationName ? ` (${formatDistance(geofence.distanceM)} dari ${geofence.locationName})` : "";
  const subject = event === "check_in" ? "Anda tercatat" : "Absen pulang tercatat";
  return { tone: "warning", text: `${subject} di luar area kerja${where}. Absen tetap diterima dan akan ditinjau atasan.` };
}

// Nilai baris "Lokasi absen" (tampilan baca section Pengaturan absen)
export function locationModeText(settings: EmployeeAttendanceSettings): string {
  if (settings.locationMode === "exempt") return "Dikecualikan — absen dari mana saja tanpa tanda";
  if (settings.locationMode === "selected") {
    const names = settings.locations.filter((l) => settings.locationIds.includes(l.id)).map((l) => l.name);
    return `Lokasi tertentu: ${names.length > 0 ? names.join(", ") : "—"}`;
  }
  return `Semua lokasi kerja (${settings.locations.length})`;
}

// Filter bawaan (Perlu ditinjau, semua jenis, semua tanggal, halaman 1) tanpa param
export function attendanceReviewsHref(query: Partial<AttendanceReviewListQuery>): string {
  const params = new URLSearchParams();
  if (query.status && query.status !== "pending") params.set("status", query.status);
  if (query.flag && query.flag !== "all") params.set("flag", query.flag);
  if (query.month) params.set("month", query.month);
  if (query.page && query.page > 1) params.set("page", String(query.page));
  const search = params.toString();
  return search ? `/attendance/review?${search}` : "/attendance/review";
}

// Waktu keputusan tinjauan ringkas: "2 Okt 10:15"
export function formatReviewedAt(at: string, timeZone: string): string {
  const day = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", timeZone }).format(new Date(at));
  return `${day} ${formatClockTime(at, timeZone)}`;
}

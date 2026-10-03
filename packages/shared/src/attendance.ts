import { z } from "zod";

import { rosterEntrySchema } from "./shiftRoster.js";
import { CALENDAR_YEAR_MAX, CALENDAR_YEAR_MIN } from "./workCalendar.js";

// Absen masuk/pulang karyawan (feature 14, portal /me). Waktu selalu dari server; lokasi GPS opsional (dicatat, tidak memblokir).

// Zona waktu usaha tanpa kota di profil usaha (feature 09) — jam jadwal dibaca sebagai jam lokal usaha
export const DEFAULT_TENANT_TIME_ZONE = "Asia/Jakarta";

// Label zona waktu Indonesia untuk tampilan ("Jam server · WITA")
export function timeZoneLabel(timeZone: string): string {
  if (timeZone === "Asia/Jakarta") return "WIB";
  if (timeZone === "Asia/Makassar") return "WITA";
  if (timeZone === "Asia/Jayapura") return "WIT";
  return timeZone;
}

export const attendanceLocationSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  // Akurasi GPS dari browser, meter
  accuracy: z.number().min(0).max(1_000_000).nullable(),
});
export type AttendanceLocation = z.infer<typeof attendanceLocationSchema>;

// Body absen masuk/pulang: hanya lokasi (boleh null — izin lokasi ditolak/tidak tersedia). Jam tidak pernah dikirim client.
// JSON biasa, atau multipart/form-data (feature 45: + file `selfie`) dengan `location` berupa string JSON / kosong.
export const attendanceClockInputSchema = z.object({
  location: z.preprocess((value) => {
    if (typeof value !== "string") return value;
    if (value.trim() === "" || value === "null") return null;
    try {
      return JSON.parse(value) as unknown;
    } catch {
      return value;
    }
  }, attendanceLocationSchema.nullable()),
});
export type AttendanceClockInput = z.infer<typeof attendanceClockInputSchema>;

// "YYYY-MM" untuk riwayat per bulan
export const attendanceMonthSchema = z
  .string()
  .regex(/^[0-9]{4}-(0[1-9]|1[0-2])$/, "Bulan tidak valid (YYYY-MM)")
  .refine((value) => {
    const year = Number(value.slice(0, 4));
    return year >= CALENDAR_YEAR_MIN && year <= CALENDAR_YEAR_MAX;
  }, "Bulan tidak valid");

export const attendanceHistoryQuerySchema = z.object({
  // Tanpa bulan → bulan berjalan di zona waktu usaha
  month: attendanceMonthSchema.optional(),
});
export type AttendanceHistoryQuery = z.infer<typeof attendanceHistoryQuerySchema>;

// Status lokasi absen terhadap lokasi kerja (feature 44) — snapshot saat absen. Absen selalu diterima; selain inside = bertanda.
// inaccurate = akurasi GPS lebih besar dari radius lokasi terdekat; no_location = izin lokasi ditolak / GPS mati.
export const GEOFENCE_STATUSES = ["inside", "outside", "inaccurate", "no_location"] as const;
export type GeofenceStatus = (typeof GEOFENCE_STATUSES)[number];

// null pada record = tidak dicek (usaha tanpa lokasi kerja, karyawan dikecualikan, absen hasil koreksi, data sebelum feature 44)
export const geofenceResultSchema = z.object({
  status: z.enum(GEOFENCE_STATUSES),
  // Jarak ke titik pusat lokasi terdekat (meter) + nama lokasi saat absen — null untuk no_location
  distanceM: z.number().int().nullable(),
  locationName: z.string().nullable(),
  accuracyM: z.number().nullable(),
});
export type GeofenceResult = z.infer<typeof geofenceResultSchema>;

// Selfie absen (feature 45): bukti kehadiran — tanpa pengenalan wajah. Dikompres di HP (±100 KB); batas server 1 MB.
// File dihapus otomatis worker setelah SELFIE_RETENTION_DAYS hari (dihitung dari tanggal kerja).
export const SELFIE_MAX_BYTES = 1024 * 1024;
export const SELFIE_RETENTION_DAYS = 90;
export const ATTENDANCE_SELFIE_QUEUE_NAME = "attendance-selfies";
export const ATTENDANCE_SELFIE_SCAN_JOB = "selfie-retention-scan";
export const ATTENDANCE_SELFIE_PURGE_JOB = "selfie-retention-purge";
export const attendanceSelfiePurgeJobDataSchema = z.object({ tenantId: z.uuid(), cutoff: z.iso.date() });
export type AttendanceSelfiePurgeJobData = z.infer<typeof attendanceSelfiePurgeJobDataSchema>;

// available = foto bisa dibuka; expired = sudah dihapus setelah 90 hari; null = absen tanpa selfie
export const SELFIE_STATES = ["available", "expired"] as const;
export type SelfieState = (typeof SELFIE_STATES)[number];

// on_time / late = hari kerja; off_day = absen di hari libur / di luar jadwal kerja (tidak dihitung telat)
export const ATTENDANCE_STATUSES = ["on_time", "late", "off_day"] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

// Akun tidak tertaut data karyawan / data karyawan nonaktif → tidak bisa absen
export const ATTENDANCE_ACCESS = ["ok", "not_linked", "inactive"] as const;
export type AttendanceAccess = (typeof ATTENDANCE_ACCESS)[number];

export const attendanceRecordSchema = z.object({
  id: z.string(),
  // Tanggal kerja di zona waktu usaha
  workDate: z.string(),
  checkInAt: z.string(),
  checkOutAt: z.string().nullable(),
  // Jadwal saat absen masuk (snapshot) — null jika bukan hari kerja
  scheduledStart: z.string().nullable(),
  scheduledEnd: z.string().nullable(),
  lateMinutes: z.number().int(),
  status: z.enum(ATTENDANCE_STATUSES),
  // Nama shift yang dicocokkan saat absen masuk (feature 47, snapshot) — null = ikut jadwal usaha / tanpa shift
  shiftName: z.string().nullable(),
  // Karyawan mode shift absen masuk di hari tanpa shift → tanda "Tanpa jadwal" (ditinjau, gaji tidak berubah)
  unscheduled: z.boolean(),
  checkInLocated: z.boolean(),
  checkOutLocated: z.boolean(),
  checkInGeofence: geofenceResultSchema.nullable(),
  checkOutGeofence: geofenceResultSchema.nullable(),
  // Foto dibuka lewat GET /attendance/records/:id/selfie/check_in|check_out
  checkInSelfie: z.enum(SELFIE_STATES).nullable(),
  checkOutSelfie: z.enum(SELFIE_STATES).nullable(),
});
export type AttendanceRecord = z.infer<typeof attendanceRecordSchema>;

export const attendanceTodaySchema = z.object({
  access: z.enum(ATTENDANCE_ACCESS),
  serverTime: z.string(),
  timeZone: z.string(),
  date: z.string(),
  day: z.object({
    isWorkday: z.boolean(),
    // "HH:MM" — null jika bukan hari kerja
    startTime: z.string().nullable(),
    endTime: z.string().nullable(),
    // Nama libur nasional/cuti bersama yang diikuti atau libur usaha
    holidayName: z.string().nullable(),
  }),
  // true = absen dicek terhadap lokasi kerja (portal meminta GPS); false = usaha tanpa lokasi / karyawan dikecualikan (tanpa izin lokasi)
  locationCheck: z.boolean(),
  // true = absen masuk/pulang wajib menyertakan selfie (portal membuka kamera depan)
  selfieRequired: z.boolean(),
  // Karyawan mode shift (feature 47) — null = ikut jadwal usaha (kartu memakai `day`)
  shift: z
    .object({
      // Tanggal kerja kartu: shift malam dihitung di tanggal mulai (setelah tengah malam bisa = kemarin, sampai absen pulang)
      workDate: z.string(),
      // null = roster belum diatur; off = libur
      entry: rosterEntrySchema.nullable(),
      // Absen masuk paling cepat (ISO) — null bila tanpa shift atau sudah absen masuk
      checkInOpensAt: z.string().nullable(),
    })
    .nullable(),
  record: attendanceRecordSchema.nullable(),
});
export type AttendanceToday = z.infer<typeof attendanceTodaySchema>;

export const attendanceHistorySchema = z.object({
  access: z.enum(ATTENDANCE_ACCESS),
  month: z.string(),
  currentMonth: z.string(),
  timeZone: z.string(),
  records: z.array(attendanceRecordSchema),
  summary: z.object({
    present: z.number().int(),
    late: z.number().int(),
    lateMinutes: z.number().int(),
    // Alpa: hari kerja yang sudah lewat tanpa absen & tanpa izin disetujui (feature 37, sama dengan rekap absensi)
    absent: z.number().int(),
  }),
});
export type AttendanceHistory = z.infer<typeof attendanceHistorySchema>;

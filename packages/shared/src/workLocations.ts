import { z } from "zod";

import { attendanceMonthSchema, type GeofenceStatus } from "./attendance.js";

// Lokasi kerja & geofence peringatan (feature 44): owner/admin menyimpan titik + radius; absen di luar radius tetap
// diterima tetapi bertanda dan masuk antrean tinjauan (/attendance/review). Tanda tidak pernah mengubah gaji.

export const WORK_LOCATION_RADIUS_MIN = 25;
export const WORK_LOCATION_RADIUS_MAX = 1000;
export const WORK_LOCATION_RADIUS_DEFAULT = 100;
export const WORK_LOCATIONS_MAX = 20;
export const WORK_LOCATION_NAME_MAX = 80;
export const WORK_LOCATION_ADDRESS_MAX = 200;

export const workLocationInputSchema = z.object({
  name: z.string("Nama lokasi wajib diisi").trim().min(1, "Nama lokasi wajib diisi").max(WORK_LOCATION_NAME_MAX, `Nama maksimal ${WORK_LOCATION_NAME_MAX} karakter`),
  address: z
    .string()
    .trim()
    .max(WORK_LOCATION_ADDRESS_MAX, `Alamat maksimal ${WORK_LOCATION_ADDRESS_MAX} karakter`)
    .nullable()
    .transform((value) => (value ? value : null)),
  latitude: z.number("Koordinat wajib diisi").min(-90, "Lintang -90 s.d. 90").max(90, "Lintang -90 s.d. 90"),
  longitude: z.number("Koordinat wajib diisi").min(-180, "Bujur -180 s.d. 180").max(180, "Bujur -180 s.d. 180"),
  radiusM: z
    .number("Radius wajib diisi")
    .int("Radius dalam meter bulat")
    .min(WORK_LOCATION_RADIUS_MIN, `Radius ${WORK_LOCATION_RADIUS_MIN}–${WORK_LOCATION_RADIUS_MAX.toLocaleString("id-ID")} m`)
    .max(WORK_LOCATION_RADIUS_MAX, `Radius ${WORK_LOCATION_RADIUS_MIN}–${WORK_LOCATION_RADIUS_MAX.toLocaleString("id-ID")} m`),
});
export type WorkLocationInput = z.input<typeof workLocationInputSchema>;
export type WorkLocationData = z.output<typeof workLocationInputSchema>;

// Field koordinat di form menerima tempelan "lintang, bujur" (mis. dari aplikasi peta). null = format tidak dikenali.
export function parseCoordinates(text: string): { latitude: number; longitude: number } | null {
  const match = /^\s*(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)\s*$/.exec(text);
  if (!match?.[1] || !match[2]) return null;
  const latitude = Number(match[1]);
  const longitude = Number(match[2]);
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return { latitude, longitude };
}

export const workLocationSchema = z.object({
  id: z.string(),
  name: z.string(),
  address: z.string().nullable(),
  latitude: z.number(),
  longitude: z.number(),
  radiusM: z.number().int(),
  // Karyawan aktif mode "lokasi tertentu" yang memilih lokasi ini
  selectedEmployeeCount: z.number().int(),
});
export type WorkLocation = z.infer<typeof workLocationSchema>;

// all = dicek di semua lokasi kerja (default); selected = hanya lokasi terpilih; exempt = tidak dicek (karyawan lapangan)
export const EMPLOYEE_LOCATION_MODES = ["all", "selected", "exempt"] as const;
export type EmployeeLocationMode = (typeof EMPLOYEE_LOCATION_MODES)[number];

export const workLocationOverviewSchema = z.object({
  items: z.array(workLocationSchema),
  // Jumlah karyawan aktif per mode lokasi
  employees: z.object({ all: z.number().int(), selected: z.number().int(), exempt: z.number().int() }),
});
export type WorkLocationOverview = z.infer<typeof workLocationOverviewSchema>;

// Pengaturan absen per karyawan (section "Pengaturan absen" di detail karyawan). Feature 45/46 menambah field di sini.
export const employeeAttendanceSettingsInputSchema = z
  .object({
    locationMode: z.enum(EMPLOYEE_LOCATION_MODES),
    locationIds: z.array(z.uuid()).max(WORK_LOCATIONS_MAX).default([]),
  })
  .refine((input) => input.locationMode !== "selected" || input.locationIds.length > 0, { path: ["locationIds"], message: "Pilih minimal satu lokasi" });
export type EmployeeAttendanceSettingsInput = z.input<typeof employeeAttendanceSettingsInputSchema>;
export type EmployeeAttendanceSettingsData = z.output<typeof employeeAttendanceSettingsInputSchema>;

export const employeeAttendanceSettingsSchema = z.object({
  locationMode: z.enum(EMPLOYEE_LOCATION_MODES),
  // Hanya terisi untuk mode selected
  locationIds: z.array(z.string()),
  // Semua lokasi kerja usaha (pilihan checkbox + nama untuk tampilan baca)
  locations: z.array(z.object({ id: z.string(), name: z.string(), radiusM: z.number().int() })),
  // owner/admin; atasan hanya baca
  canEdit: z.boolean(),
});
export type EmployeeAttendanceSettings = z.infer<typeof employeeAttendanceSettingsSchema>;

// ——— Tinjauan absensi bertanda ———

export const ATTENDANCE_EVENTS = ["check_in", "check_out"] as const;
export type AttendanceEvent = (typeof ATTENDANCE_EVENTS)[number];

// Jenis tanda — generik: feature 47 menambah "no_schedule" (absen di hari tanpa shift)
export const ATTENDANCE_FLAG_KINDS = ["outside", "inaccurate", "no_location"] as const satisfies readonly GeofenceStatus[];
export type AttendanceFlagKind = (typeof ATTENDANCE_FLAG_KINDS)[number];

export const ATTENDANCE_FLAG_LABELS: Record<AttendanceFlagKind, string> = {
  outside: "Di luar lokasi",
  inaccurate: "Lokasi tidak akurat",
  no_location: "Tanpa lokasi",
};

export function isAttendanceFlag(status: GeofenceStatus | null): status is AttendanceFlagKind {
  return status !== null && status !== "inside";
}

export const ATTENDANCE_REVIEW_DECISIONS = ["accepted", "follow_up"] as const;
export type AttendanceReviewDecision = (typeof ATTENDANCE_REVIEW_DECISIONS)[number];

export const ATTENDANCE_REVIEW_DECISION_LABELS: Record<AttendanceReviewDecision, string> = {
  accepted: "Diterima",
  follow_up: "Perlu tindak lanjut",
};

export const ATTENDANCE_REVIEW_NOTE_MAX = 500;

// Catatan wajib untuk "Perlu tindak lanjut"; opsional untuk "Diterima"
export const attendanceReviewDecisionSchema = z
  .object({
    decision: z.enum(ATTENDANCE_REVIEW_DECISIONS),
    note: z.string().trim().max(ATTENDANCE_REVIEW_NOTE_MAX, `Catatan maksimal ${ATTENDANCE_REVIEW_NOTE_MAX} karakter`).default(""),
  })
  .refine((input) => input.decision === "accepted" || input.note.length >= 3, { path: ["note"], message: "Tulis catatan tindak lanjut (minimal 3 karakter)" });
export type AttendanceReviewDecisionInput = z.input<typeof attendanceReviewDecisionSchema>;
export type AttendanceReviewDecisionData = z.output<typeof attendanceReviewDecisionSchema>;

export const ATTENDANCE_REVIEW_FILTERS = ["pending", "reviewed", "all"] as const;
export type AttendanceReviewFilter = (typeof ATTENDANCE_REVIEW_FILTERS)[number];

export const ATTENDANCE_REVIEWS_PAGE_SIZE = 20;

export const attendanceReviewListQuerySchema = z.object({
  status: z.enum(ATTENDANCE_REVIEW_FILTERS).catch("pending"),
  flag: z.enum([...ATTENDANCE_FLAG_KINDS, "all"]).catch("all"),
  // Tanpa bulan → semua tanggal (agar tinjauan bulan lalu yang tertunda tetap terlihat)
  month: attendanceMonthSchema.optional().catch(undefined),
  page: z.coerce.number().int().min(1).catch(1),
});
export type AttendanceReviewListQuery = z.infer<typeof attendanceReviewListQuerySchema>;

export const attendanceReviewItemSchema = z.object({
  recordId: z.string(),
  event: z.enum(ATTENDANCE_EVENTS),
  employee: z.object({ id: z.string(), fullName: z.string(), positionName: z.string() }),
  workDate: z.string(),
  // Jam absen masuk/pulang (ISO)
  at: z.string(),
  flag: z.object({
    kind: z.enum(ATTENDANCE_FLAG_KINDS),
    distanceM: z.number().int().nullable(),
    locationName: z.string().nullable(),
    accuracyM: z.number().nullable(),
  }),
  review: z
    .object({
      decision: z.enum(ATTENDANCE_REVIEW_DECISIONS),
      note: z.string().nullable(),
      reviewedByName: z.string().nullable(),
      reviewedAt: z.string(),
    })
    .nullable(),
  // false = absen milik penglihat sendiri (tidak meninjau absensi sendiri)
  canReview: z.boolean(),
});
export type AttendanceReviewItem = z.infer<typeof attendanceReviewItemSchema>;

export const attendanceReviewListSchema = z.object({
  items: z.array(attendanceReviewItemSchema),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
  // Belum ditinjau dengan filter jenis & bulan yang sama
  pendingCount: z.number().int(),
  timeZone: z.string(),
  // false → empty state "Lokasi kerja belum diatur"
  hasLocations: z.boolean(),
});
export type AttendanceReviewList = z.infer<typeof attendanceReviewListSchema>;

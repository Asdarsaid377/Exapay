import { z } from "zod";

import { attendanceMonthSchema } from "./attendance.js";
import { LEAVE_REASON_MAX } from "./leaveRequests.js";
import { CALENDAR_YEAR_MAX, CALENDAR_YEAR_MIN, isoDateSchema } from "./workCalendar.js";

// Rekap & koreksi absensi (feature 16): rekap per periode di /attendance (owner/admin semua, atasan bawahan langsung),
// rincian harian + koreksi jam masuk/pulang oleh owner/admin di /attendance/corrections (audit log).

// Rentang rekap maksimal (hari kalender) — sama dengan batas satu pengajuan izin
export const ATTENDANCE_RECAP_MAX_DAYS = 92;
export const ATTENDANCE_CORRECTIONS_PAGE_SIZE = 20;

const DAY_MS = 24 * 60 * 60 * 1000;

const periodDateSchema = isoDateSchema.refine((value) => {
  const year = Number(value.slice(0, 4));
  return year >= CALENDAR_YEAR_MIN && year <= CALENDAR_YEAR_MAX;
}, "Tahun di luar rentang yang didukung");

// Periode: bulan (YYYY-MM) atau rentang bebas from–to. Tanpa keduanya → bulan berjalan di zona waktu usaha.
export const attendancePeriodQuerySchema = z
  .object({
    month: attendanceMonthSchema.optional(),
    from: periodDateSchema.optional(),
    to: periodDateSchema.optional(),
  })
  .refine((query) => (query.from === undefined) === (query.to === undefined), { path: ["to"], message: "Isi tanggal mulai dan selesai" })
  .refine((query) => !query.from || !query.to || query.to >= query.from, { path: ["to"], message: "Tanggal selesai tidak boleh sebelum tanggal mulai" })
  .refine(
    (query) => !query.from || !query.to || (Date.parse(`${query.to}T00:00:00Z`) - Date.parse(`${query.from}T00:00:00Z`)) / DAY_MS < ATTENDANCE_RECAP_MAX_DAYS,
    { path: ["to"], message: `Rentang maksimal ${ATTENDANCE_RECAP_MAX_DAYS} hari` },
  );
export type AttendancePeriodQuery = z.infer<typeof attendancePeriodQuerySchema>;

// Status satu tanggal untuk satu karyawan:
// on_time/late = absen di hari kerja · absent = alpa (hari kerja lewat tanpa absen & tanpa izin disetujui)
// permit/sick/leave = izin disetujui · off_day_present = absen di luar hari kerja · off = bukan hari kerja
// pending = hari kerja hari ini/mendatang tanpa absen (belum alpa) · not_employed = di luar masa kerja
export const ATTENDANCE_DAY_STATUSES = ["on_time", "late", "absent", "permit", "sick", "leave", "off_day_present", "off", "pending", "not_employed"] as const;
export type AttendanceDayStatus = (typeof ATTENDANCE_DAY_STATUSES)[number];

export const attendanceRecapSummarySchema = z.object({
  // Hari kerja jadwal dalam periode ∩ masa kerja karyawan (termasuk yang belum berjalan)
  workingDays: z.number().int(),
  // Absen di hari kerja (tepat waktu + telat)
  present: z.number().int(),
  late: z.number().int(),
  lateMinutes: z.number().int(),
  absent: z.number().int(),
  permit: z.number().int(),
  sick: z.number().int(),
  leave: z.number().int(),
  // Absen di hari libur / di luar jadwal kerja
  offDayPresent: z.number().int(),
  // Hari yang sudah lewat dengan absen masuk tanpa absen pulang
  missingCheckOut: z.number().int(),
});
export type AttendanceRecapSummary = z.infer<typeof attendanceRecapSummarySchema>;

const recapEmployeeSchema = z.object({
  id: z.string(),
  fullName: z.string(),
  positionName: z.string(),
  departmentName: z.string(),
  joinDate: z.string(),
  endDate: z.string().nullable(),
});

export const attendanceRecapSchema = z.object({
  from: z.string(),
  to: z.string(),
  // Bulan payroll yang ditampilkan (periode tutup buku, feature 30b); null = rentang bebas
  month: z.string().nullable(),
  // Bulan payroll yang periodenya memuat hari ini — bulan sesudahnya belum bisa dibuka
  currentMonth: z.string(),
  // Tanggal tutup buku usaha (null = akhir bulan)
  cutoffDay: z.number().int().nullable(),
  // Tanggal hari ini di zona waktu usaha (hari kerja ≥ hari ini belum dihitung alpa)
  today: z.string(),
  timeZone: z.string(),
  // all = owner/admin; subordinates = atasan (bawahan langsung)
  scope: z.enum(["all", "subordinates"]),
  // Hari kerja jadwal dalam periode (tanpa memperhitungkan masa kerja)
  workingDays: z.number().int(),
  // Karyawan yang masa kerjanya beririsan dengan periode, urut nama
  rows: z.array(z.object({ employee: recapEmployeeSchema, summary: attendanceRecapSummarySchema })),
});
export type AttendanceRecap = z.infer<typeof attendanceRecapSchema>;
export type AttendanceRecapRow = AttendanceRecap["rows"][number];

export const attendanceDaySchema = z.object({
  date: z.string(),
  status: z.enum(ATTENDANCE_DAY_STATUSES),
  // Absen hari itu (jika ada)
  record: z
    .object({
      checkInAt: z.string(),
      checkOutAt: z.string().nullable(),
      lateMinutes: z.number().int(),
      scheduledStart: z.string().nullable(),
      scheduledEnd: z.string().nullable(),
    })
    .nullable(),
  // Pernah dikoreksi owner/admin
  corrected: z.boolean(),
});
export type AttendanceDay = z.infer<typeof attendanceDaySchema>;

export const employeeAttendanceDaysSchema = z.object({
  employee: recapEmployeeSchema,
  from: z.string(),
  to: z.string(),
  // Bulan payroll terpilih (null = rentang bebas) & bulan berjalan — navigasi periode tab Absensi detail karyawan (feature 37b)
  month: z.string().nullable(),
  currentMonth: z.string(),
  today: z.string(),
  timeZone: z.string(),
  summary: attendanceRecapSummarySchema,
  // Urut tanggal naik, seluruh periode
  days: z.array(attendanceDaySchema),
  // Penglihat boleh mengoreksi (owner/admin, bukan absensinya sendiri)
  canCorrect: z.boolean(),
});
export type EmployeeAttendanceDays = z.infer<typeof employeeAttendanceDaysSchema>;

// ——— Koreksi ———

const clockTimeSchema = z.string("Jam wajib diisi").regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/, "Jam tidak valid (JJ:MM)");

// Jam lokal usaha pada tanggal kerja. Tanpa shift malam: pulang harus setelah masuk di tanggal yang sama.
export const attendanceCorrectionInputSchema = z
  .object({
    employeeId: z.uuid("Karyawan tidak valid"),
    workDate: periodDateSchema,
    checkIn: clockTimeSchema,
    // null = belum/tidak ada absen pulang
    checkOut: clockTimeSchema.nullable(),
    reason: z
      .string("Alasan koreksi wajib diisi")
      .trim()
      .min(3, "Alasan minimal 3 karakter")
      .max(LEAVE_REASON_MAX, `Alasan maksimal ${LEAVE_REASON_MAX} karakter`),
  })
  .refine((input) => input.checkOut === null || input.checkOut > input.checkIn, { path: ["checkOut"], message: "Jam pulang harus setelah jam masuk" });
export type AttendanceCorrectionInput = z.infer<typeof attendanceCorrectionInputSchema>;

export const attendanceCorrectionListQuerySchema = z.object({
  employeeId: z.uuid().nullable().catch(null),
  page: z.coerce.number().int().min(1).catch(1),
});
export type AttendanceCorrectionListQuery = z.infer<typeof attendanceCorrectionListQuerySchema>;

const correctionTimesSchema = z.object({
  checkInAt: z.string().nullable(),
  checkOutAt: z.string().nullable(),
  lateMinutes: z.number().int().nullable(),
});

export const attendanceCorrectionSchema = z.object({
  id: z.string(),
  employee: z.object({ id: z.string(), fullName: z.string() }),
  workDate: z.string(),
  // checkInAt null = sebelumnya tidak ada absen
  before: correctionTimesSchema,
  after: correctionTimesSchema,
  reason: z.string(),
  // null jika akun pengoreksi sudah dihapus
  correctedByName: z.string().nullable(),
  createdAt: z.string(),
});
export type AttendanceCorrection = z.infer<typeof attendanceCorrectionSchema>;

export const attendanceCorrectionListSchema = z.object({
  items: z.array(attendanceCorrectionSchema),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
  timeZone: z.string(),
});
export type AttendanceCorrectionList = z.infer<typeof attendanceCorrectionListSchema>;

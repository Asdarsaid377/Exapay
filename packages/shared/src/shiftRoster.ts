import { z } from "zod";

import { isoDateSchema } from "./workCalendar.js";

// Master shift & roster (feature 46) — opsional: usaha tanpa master shift tidak melihat fitur shift. Karyawan default
// "ikut jadwal usaha" (jadwal mingguan feature 13); hanya karyawan mode "shift" yang dijadwalkan per tanggal di roster.
// Satu shift per karyawan per tanggal. Shift boleh melewati tengah malam (selesai ≤ mulai = keesokan hari).

export const WORK_SHIFTS_MAX = 20;
export const WORK_SHIFT_NAME_MAX = 40;
export const ROSTER_DAYS = 7;
// Portal "Jadwal saya": hari ini + 6 hari
export const MY_SCHEDULE_DAYS = 7;
// Absen masuk karyawan mode shift paling cepat 2 jam sebelum shift mulai (feature 47)
export const SHIFT_CHECK_IN_EARLY_MINUTES = 120;

// business = ikut jadwal usaha (default); shift = dijadwalkan lewat roster
export const EMPLOYEE_SCHEDULE_MODES = ["business", "shift"] as const;
export type EmployeeScheduleMode = (typeof EMPLOYEE_SCHEDULE_MODES)[number];

const clockSchema = z.string("Jam wajib diisi").regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/, "Jam tidak valid (JJ:MM)");

export const workShiftInputSchema = z
  .object({
    name: z.string("Nama shift wajib diisi").trim().min(1, "Nama shift wajib diisi").max(WORK_SHIFT_NAME_MAX, `Nama maksimal ${WORK_SHIFT_NAME_MAX} karakter`),
    startTime: clockSchema,
    endTime: clockSchema,
  })
  .refine((input) => input.startTime !== input.endTime, { path: ["endTime"], message: "Jam mulai dan selesai tidak boleh sama" });
export type WorkShiftInput = z.infer<typeof workShiftInputSchema>;

// "HH:MM" → menit sejak 00:00
function minutesOf(time: string): number {
  return Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
}

// Selesai ≤ mulai = selesai keesokan hari (+1)
export function isOvernightShift(startTime: string, endTime: string): boolean {
  return minutesOf(endTime) <= minutesOf(startTime);
}

// Durasi shift dalam menit (shift malam dihitung melewati tengah malam)
export function shiftDurationMinutes(startTime: string, endTime: string): number {
  const diff = minutesOf(endTime) - minutesOf(startTime);
  return diff > 0 ? diff : diff + 24 * 60;
}

export const workShiftSchema = z.object({
  id: z.string(),
  name: z.string(),
  startTime: z.string(),
  endTime: z.string(),
  overnight: z.boolean(),
  durationMinutes: z.number().int(),
  // Tanggal hari ini & ke depan yang memakai shift ini (dialog hapus: jadwal itu akan dikosongkan bila belum terkunci)
  upcomingAssignments: z.number().int(),
  // Karyawan berbeda yang dijadwalkan shift ini pada minggu berjalan (Sen–Min)
  employeesThisWeek: z.number().int(),
});
export type WorkShift = z.infer<typeof workShiftSchema>;

export const workShiftListSchema = z.object({
  items: z.array(workShiftSchema),
  // Karyawan aktif bermode shift (ajakan "Buka roster")
  shiftEmployeeCount: z.number().int(),
  canManage: z.boolean(),
});
export type WorkShiftList = z.infer<typeof workShiftListSchema>;

// Isi satu sel roster: shift (snapshot nama & jam saat dijadwalkan) atau libur. null = belum diatur.
export const rosterEntrySchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("shift"),
    // null = master shift sudah dihapus (sel terkunci menyimpan snapshot)
    shiftId: z.string().nullable(),
    name: z.string(),
    startTime: z.string(),
    endTime: z.string(),
    overnight: z.boolean(),
  }),
  z.object({ kind: z.literal("off") }),
]);
export type RosterEntry = z.infer<typeof rosterEntrySchema>;

// past = tanggal sudah lewat; attended = karyawan sudah absen di tanggal itu; payroll_final = periode gaji sudah final;
// not_employed = di luar masa kerja. Koreksi tanggal terkunci lewat koreksi absensi.
export const ROSTER_LOCK_REASONS = ["past", "attended", "payroll_final", "not_employed"] as const;
export type RosterLockReason = (typeof ROSTER_LOCK_REASONS)[number];

export const ROSTER_LOCK_LABELS: Record<RosterLockReason, string> = {
  past: "Sudah lewat",
  attended: "Sudah absen",
  payroll_final: "Periode gaji sudah final",
  not_employed: "Di luar masa kerja",
};

export const rosterCellSchema = z.object({
  date: z.string(),
  entry: rosterEntrySchema.nullable(),
  lock: z.enum(ROSTER_LOCK_REASONS).nullable(),
});
export type RosterCell = z.infer<typeof rosterCellSchema>;

export const rosterQuerySchema = z.object({
  // Tanggal mana pun di minggu yang diminta — dinormalkan ke Senin. Tanpa tanggal → minggu berjalan.
  week: isoDateSchema.optional(),
  departmentId: z.uuid().optional(),
});
export type RosterQuery = z.infer<typeof rosterQuerySchema>;

export const rosterWeekSchema = z.object({
  // Senin minggu ini (YYYY-MM-DD) & 7 tanggal
  weekStart: z.string(),
  dates: z.array(z.string()),
  today: z.string(),
  timeZone: z.string(),
  shifts: z.array(z.object({ id: z.string(), name: z.string(), startTime: z.string(), endTime: z.string(), overnight: z.boolean() })),
  employees: z.array(
    z.object({
      id: z.string(),
      fullName: z.string(),
      positionName: z.string(),
      departmentName: z.string(),
      cells: z.array(rosterCellSchema),
      // Jumlah hari ber-shift minggu ini
      shiftCount: z.number().int(),
    }),
  ),
  // Karyawan aktif dalam cakupan yang ikut jadwal usaha (tidak tampil di roster)
  businessModeCount: z.number().int(),
  // false = usaha belum punya master shift (menu Roster disembunyikan)
  hasShifts: z.boolean(),
  canManageShifts: z.boolean(),
});
export type RosterWeek = z.infer<typeof rosterWeekSchema>;

export const rosterCellInputSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("shift"), shiftId: z.uuid("Shift tidak valid") }),
  z.object({ kind: z.literal("off") }),
  // Kosongkan = belum diatur
  z.object({ kind: z.literal("clear") }),
]);
export type RosterCellInput = z.infer<typeof rosterCellInputSchema>;

export const rosterCopyInputSchema = z.object({
  // Minggu tujuan (tanggal mana pun di minggu itu); sumber = 7 hari sebelumnya
  week: isoDateSchema,
  departmentId: z.uuid().nullable().default(null),
  // true = hanya hitung (dialog konfirmasi), tanpa menyimpan
  dryRun: z.boolean().default(false),
});
export type RosterCopyInput = z.input<typeof rosterCopyInputSchema>;
export type RosterCopyData = z.output<typeof rosterCopyInputSchema>;

export const rosterCopyResultSchema = z.object({
  // Sel yang diisi dari minggu lalu (termasuk yang menimpa isi lama)
  filled: z.number().int(),
  // Bagian dari `filled` yang sebelumnya sudah berisi lain
  overwritten: z.number().int(),
  skippedLocked: z.number().int(),
  // Sumber memakai shift yang sudah dihapus
  skippedDeletedShift: z.number().int(),
  dryRun: z.boolean(),
});
export type RosterCopyResult = z.infer<typeof rosterCopyResultSchema>;

// Portal "Jadwal saya" (karyawan mode shift)
export const myScheduleSchema = z.object({
  mode: z.enum(EMPLOYEE_SCHEDULE_MODES),
  today: z.string(),
  timeZone: z.string(),
  // Kosong untuk mode business
  days: z.array(z.object({ date: z.string(), entry: rosterEntrySchema.nullable() })),
});
export type MySchedule = z.infer<typeof myScheduleSchema>;

// Antrean BullMQ "roster" — pemberitahuan perubahan jadwal ke karyawan (email), diproses apps/worker.
// Beberapa perubahan berdekatan digabung: job tertunda dengan jobId per karyawan per jendela waktu.
export const ROSTER_QUEUE_NAME = "roster";
export const ROSTER_NOTIFY_JOB = "roster-notify";
export const ROSTER_NOTIFY_DELAY_MS = 2 * 60 * 1000;
export const rosterNotifyJobDataSchema = z.object({ tenantId: z.uuid(), employeeId: z.uuid() });
export type RosterNotifyJobData = z.infer<typeof rosterNotifyJobDataSchema>;

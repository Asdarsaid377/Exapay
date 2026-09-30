import { z } from "zod";

// Jadwal kerja & hari libur (feature 13, /settings/attendance). Dipakai absensi (telat), KPI (prorata target), payroll (hari kerja).

// Hari ISO: 1 = Senin … 7 = Minggu
export const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export const WEEKDAY_LABELS: Record<Weekday, string> = {
  1: "Senin",
  2: "Selasa",
  3: "Rabu",
  4: "Kamis",
  5: "Jumat",
  6: "Sabtu",
  7: "Minggu",
};

// Jenis hari libur dari SKB 3 Menteri (data referensi platform)
export const NATIONAL_HOLIDAY_KINDS = ["libur_nasional", "cuti_bersama"] as const;
export type NationalHolidayKind = (typeof NATIONAL_HOLIDAY_KINDS)[number];

// Tahun yang boleh diminta/diisi (menjaga query & input tetap wajar)
export const CALENDAR_YEAR_MIN = 2000;
export const CALENDAR_YEAR_MAX = 2100;
// Rentang hitung hari kerja maksimal (2 tahun) — cukup untuk KPI & payroll
export const WORKING_DAYS_MAX_RANGE = 731;

export type WorkScheduleDay = {
  weekday: Weekday;
  isWorkday: boolean;
  // "HH:MM" — tetap disimpan saat hari libur agar jam kembali saat hari diaktifkan lagi
  startTime: string;
  endTime: string;
};

// Jadwal bawaan usaha baru (dan pengisian awal migration 0010): Senin–Jumat 08.00–17.00
export const DEFAULT_WORK_SCHEDULE: readonly WorkScheduleDay[] = WEEKDAYS.map((weekday) => ({
  weekday,
  isWorkday: weekday <= 5,
  startTime: "08:00",
  endTime: "17:00",
}));

// Tanggal kalender YYYY-MM-DD yang benar-benar ada (menolak 2026-02-30)
export function isValidIsoDate(value: string): boolean {
  if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export const isoDateSchema = z.string("Tanggal wajib diisi").refine(isValidIsoDate, "Tanggal tidak valid");

const timeSchema = z.string().regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/, "Jam tidak valid (JJ:MM)");

export const workScheduleInputSchema = z.object({
  days: z
    .array(
      z
        .object({
          weekday: z.literal(WEEKDAYS),
          isWorkday: z.boolean(),
          startTime: timeSchema,
          endTime: timeSchema,
        })
        // Tanpa shift malam (lintas tengah malam) — shift per karyawan ada di fase berikutnya
        .refine((day) => day.startTime < day.endTime, { message: "Jam pulang harus setelah jam masuk", path: ["endTime"] }),
    )
    .length(7, "Jadwal harus berisi 7 hari")
    .refine((days) => new Set(days.map((d) => d.weekday)).size === 7, "Setiap hari hanya boleh muncul sekali")
    .refine((days) => days.some((d) => d.isWorkday), "Minimal satu hari kerja dalam seminggu"),
});
export type WorkScheduleInput = z.infer<typeof workScheduleInputSchema>;

export type WorkSchedule = {
  days: WorkScheduleDay[];
  updatedAt: string | null;
};

export const companyHolidayInputSchema = z.object({
  date: isoDateSchema.refine((value) => {
    const year = Number(value.slice(0, 4));
    return year >= CALENDAR_YEAR_MIN && year <= CALENDAR_YEAR_MAX;
  }, "Tahun di luar rentang yang didukung"),
  name: z.string().trim().min(2, "Keterangan minimal 2 karakter").max(80, "Keterangan maksimal 80 karakter"),
});
export type CompanyHolidayInput = z.infer<typeof companyHolidayInputSchema>;

export const nationalHolidayObservanceSchema = z.object({
  // false = usaha tetap masuk kerja di tanggal ini
  observed: z.boolean("Pilih libur atau tetap masuk"),
});
export type NationalHolidayObservanceInput = z.infer<typeof nationalHolidayObservanceSchema>;

export const calendarYearSchema = z.coerce
  .number("Tahun tidak valid")
  .int("Tahun tidak valid")
  .min(CALENDAR_YEAR_MIN, "Tahun tidak valid")
  .max(CALENDAR_YEAR_MAX, "Tahun tidak valid");

export const workingDaysQuerySchema = z
  .object({ from: isoDateSchema, to: isoDateSchema })
  .refine((q) => q.from <= q.to, { message: "Tanggal akhir harus sama atau setelah tanggal awal", path: ["to"] })
  .refine((q) => (Date.parse(q.to) - Date.parse(q.from)) / 86_400_000 < WORKING_DAYS_MAX_RANGE, {
    message: "Rentang maksimal 2 tahun",
    path: ["to"],
  });
export type WorkingDaysQuery = z.infer<typeof workingDaysQuerySchema>;

export type NationalHoliday = {
  date: string;
  name: string;
  kind: NationalHolidayKind;
  // false = usaha memilih tetap masuk kerja
  observed: boolean;
};

export type CompanyHoliday = {
  id: string;
  date: string;
  name: string;
};

export type HolidayOverview = {
  year: number;
  // Tahun yang punya data libur nasional (untuk pilihan tahun)
  nationalYears: number[];
  national: NationalHoliday[];
  company: CompanyHoliday[];
  // Hari kerja per bulan (Jan–Des) dari jadwal + libur yang berlaku
  workingDaysByMonth: number[];
};

export type WorkingDaysResult = {
  from: string;
  to: string;
  workingDays: number;
  // Hari libur (nasional yang diikuti + libur usaha) yang jatuh di hari kerja jadwal
  holidaysOnWorkdays: number;
};

// Validasi respons API di web
export const workScheduleSchema: z.ZodType<WorkSchedule> = z.object({
  days: z.array(
    z.object({
      weekday: z.literal(WEEKDAYS),
      isWorkday: z.boolean(),
      startTime: z.string(),
      endTime: z.string(),
    }),
  ),
  updatedAt: z.string().nullable(),
});

export const companyHolidaySchema: z.ZodType<CompanyHoliday> = z.object({ id: z.string(), date: z.string(), name: z.string() });

export const holidayOverviewSchema: z.ZodType<HolidayOverview> = z.object({
  year: z.number(),
  nationalYears: z.array(z.number()),
  national: z.array(z.object({ date: z.string(), name: z.string(), kind: z.enum(NATIONAL_HOLIDAY_KINDS), observed: z.boolean() })),
  company: z.array(companyHolidaySchema),
  workingDaysByMonth: z.array(z.number()),
});

export const workingDaysResultSchema: z.ZodType<WorkingDaysResult> = z.object({
  from: z.string(),
  to: z.string(),
  workingDays: z.number(),
  holidaysOnWorkdays: z.number(),
});

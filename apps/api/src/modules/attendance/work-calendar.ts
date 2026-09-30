import type { Weekday } from "@exapay/shared";

// Hitung hari kerja (feature 13) — fungsi murni tanpa DB/tanggal sistem, dipakai KPI (prorata target) & payroll (pembagi hari kerja).
// Semua tanggal berupa string kalender YYYY-MM-DD dan dihitung di UTC agar tidak bergeser oleh zona waktu server.

export type WorkCalendar = {
  // Hari dalam seminggu yang dijadwalkan kerja (1 = Senin … 7 = Minggu)
  workdays: ReadonlySet<Weekday>;
  // Libur yang berlaku untuk usaha: libur nasional/cuti bersama yang diikuti + libur usaha
  holidays: ReadonlySet<string>;
};

const DAY_MS = 86_400_000;

function toUtcMs(isoDate: string): number {
  return Date.parse(`${isoDate}T00:00:00Z`);
}

// Hari ISO dari tanggal kalender: getUTCDay() 0 = Minggu → 7
export function isoWeekday(isoDate: string): Weekday {
  const day = new Date(toUtcMs(isoDate)).getUTCDay();
  const weekdays: readonly Weekday[] = [7, 1, 2, 3, 4, 5, 6];
  const weekday = weekdays[day];
  if (weekday === undefined) throw new Error(`[work-calendar] tanggal tidak valid: ${isoDate}`);
  return weekday;
}

export function isWorkingDay(calendar: WorkCalendar, isoDate: string): boolean {
  return calendar.workdays.has(isoWeekday(isoDate)) && !calendar.holidays.has(isoDate);
}

// Semua tanggal kerja dari `from` sampai `to` (inklusif). from > to → kosong.
export function workingDatesBetween(calendar: WorkCalendar, from: string, to: string): string[] {
  const dates: string[] = [];
  for (let ms = toUtcMs(from), end = toUtcMs(to); ms <= end; ms += DAY_MS) {
    const date = new Date(ms).toISOString().slice(0, 10);
    if (isWorkingDay(calendar, date)) dates.push(date);
  }
  return dates;
}

export function countWorkingDays(calendar: WorkCalendar, from: string, to: string): number {
  return workingDatesBetween(calendar, from, to).length;
}

// Libur yang benar-benar mengurangi hari kerja (jatuh di hari kerja jadwal) dalam rentang
export function countHolidaysOnWorkdays(calendar: WorkCalendar, from: string, to: string): number {
  let total = 0;
  for (const date of calendar.holidays) {
    if (date >= from && date <= to && calendar.workdays.has(isoWeekday(date))) total += 1;
  }
  return total;
}

// Hari kerja per bulan (index 0 = Januari) untuk satu tahun
export function workingDaysByMonth(calendar: WorkCalendar, year: number): number[] {
  const counts = Array.from({ length: 12 }, () => 0);
  // Tahun dibatasi 2000–2100 oleh schema → selalu 4 digit
  for (const date of workingDatesBetween(calendar, `${year}-01-01`, `${year}-12-31`)) {
    const month = Number(date.slice(5, 7)) - 1;
    counts[month] = (counts[month] ?? 0) + 1;
  }
  return counts;
}

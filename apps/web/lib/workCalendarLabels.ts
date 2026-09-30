import { type NationalHolidayKind, type Weekday, WEEKDAY_LABELS } from "@exapay/shared";

// Teks UI /settings/attendance

export const HOLIDAY_KIND_LABELS: Record<NationalHolidayKind, string> = {
  libur_nasional: "Libur nasional",
  cuti_bersama: "Cuti bersama",
};

export const MONTH_SHORT_LABELS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"] as const;

// Hari ISO dari tanggal kalender YYYY-MM-DD (1 = Senin … 7 = Minggu), tanpa geser zona waktu
const BY_UTC_DAY: readonly Weekday[] = [7, 1, 2, 3, 4, 5, 6];

export function weekdayOf(isoDate: string): Weekday {
  return BY_UTC_DAY[new Date(`${isoDate}T00:00:00Z`).getUTCDay()] ?? 7;
}

export function weekdayLabelOf(isoDate: string): string {
  return WEEKDAY_LABELS[weekdayOf(isoDate)];
}

// Link halaman dengan tahun libur terpilih
export function attendanceSettingsHref(year: number, currentYear: number): string {
  return year === currentYear ? "/settings/attendance" : `/settings/attendance?year=${year}`;
}

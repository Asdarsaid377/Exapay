import { type AttendanceDayStatus, type AttendancePeriodQuery, attendancePeriodQuerySchema } from "@exapay/shared";

import type { BadgeTone } from "@/components/common/Badge";
import { formatDuration, monthLabel } from "@/lib/attendanceLabels";
import { formatDateRange } from "@/lib/leaveLabels";

// Teks, periode & tautan rekap/koreksi absensi (feature 16)

// Periode tampilan: bulan (panah pindah bulan) atau rentang bebas
export type PeriodView = { kind: "month"; month: string } | { kind: "range"; from: string; to: string };

type SearchParams = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined): string | undefined => (typeof value === "string" ? value : undefined);

// Periode dari URL; tidak valid → bulan berjalan (API memakai zona waktu usaha)
export function periodQueryFrom(raw: SearchParams): AttendancePeriodQuery {
  const parsed = attendancePeriodQuerySchema.safeParse({ month: first(raw.month), from: first(raw.from), to: first(raw.to) });
  return parsed.success ? parsed.data : {};
}

export function periodViewOf(query: AttendancePeriodQuery, today: string): PeriodView {
  if (query.from && query.to) return { kind: "range", from: query.from, to: query.to };
  return { kind: "month", month: query.month ?? today.slice(0, 7) };
}

export function periodLabel(view: PeriodView): string {
  return view.kind === "month" ? monthLabel(view.month) : formatDateRange(view.from, view.to);
}

// Parameter URL periode; bulan berjalan tanpa param
export function periodSearchParams(view: PeriodView, currentMonth: string): URLSearchParams {
  const params = new URLSearchParams();
  if (view.kind === "range") {
    params.set("from", view.from);
    params.set("to", view.to);
  } else if (view.month !== currentMonth) {
    params.set("month", view.month);
  }
  return params;
}

export function recapHref(view: PeriodView, currentMonth: string): string {
  const query = periodSearchParams(view, currentMonth).toString();
  return query ? `/attendance?${query}` : "/attendance";
}

export function correctionsHref(options: { employeeId: string | null; view: PeriodView; currentMonth: string; page?: number }): string {
  const params = new URLSearchParams();
  if (options.employeeId) params.set("employee", options.employeeId);
  for (const [key, value] of periodSearchParams(options.view, options.currentMonth)) params.set(key, value);
  if (options.page && options.page > 1) params.set("page", String(options.page));
  const query = params.toString();
  return query ? `/attendance/corrections?${query}` : "/attendance/corrections";
}

export const DAY_STATUS_TONES: Record<AttendanceDayStatus, BadgeTone> = {
  on_time: "success",
  late: "warning",
  absent: "danger",
  permit: "info",
  sick: "info",
  leave: "info",
  off_day_present: "neutral",
  off: "neutral",
  pending: "neutral",
  not_employed: "outline",
};

export function dayStatusLabel(status: AttendanceDayStatus, lateMinutes: number, isToday: boolean): string {
  switch (status) {
    case "on_time":
      return "Tepat waktu";
    case "late":
      return `Telat ${formatDuration(lateMinutes)}`;
    case "absent":
      return "Alpa";
    case "permit":
      return "Izin";
    case "sick":
      return "Sakit";
    case "leave":
      return "Cuti";
    case "off_day_present":
      return "Masuk di hari libur";
    case "off":
      return "Bukan hari kerja";
    case "pending":
      return isToday ? "Belum absen" : "Belum berjalan";
    case "not_employed":
      return "Di luar masa kerja";
  }
}

import { isOvernightShift, ROSTER_LOCK_LABELS, type RosterEntry, type RosterLockReason, shiftDurationMinutes } from "@exapay/shared";

// Label tampilan shift & roster (feature 46)

// 480 → "8 jam", 450 → "7 jam 30 mnt"
export function formatShiftDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} mnt`;
  return rest === 0 ? `${hours} jam` : `${hours} jam ${rest} mnt`;
}

// Keterangan dialog shift: "Selesai keesokan hari (+1) — durasi 8 jam" / "Durasi 8 jam"; null bila jam belum lengkap / sama
export function shiftDurationNote(startTime: string, endTime: string): { text: string; overnight: boolean } | null {
  if (!/^\d{2}:\d{2}$/.test(startTime) || !/^\d{2}:\d{2}$/.test(endTime) || startTime === endTime) return null;
  const duration = formatShiftDuration(shiftDurationMinutes(startTime, endTime));
  return isOvernightShift(startTime, endTime)
    ? { text: `Selesai keesokan hari (+1) — durasi ${duration}`, overnight: true }
    : { text: `Durasi ${duration}`, overnight: false };
}

// "07:00" → "07"
function hourOf(time: string): string {
  return time.slice(3, 5) === "00" ? time.slice(0, 2) : time;
}

// Jam pendek di sel roster: "07–15"
export function shortShiftRange(startTime: string, endTime: string): string {
  return `${hourOf(startTime)}–${hourOf(endTime)}`;
}

// "Pagi 07:00–15:00", "Malam 22:00–06:00 (+1)", "Libur"
export function rosterEntryLabel(entry: RosterEntry): string {
  if (entry.kind === "off") return "Libur";
  return `${entry.name} ${entry.startTime}–${entry.endTime}${entry.overnight ? " (+1)" : ""}`;
}

// Shift per hari di rincian absensi (design attendance-selfie-detail): "Pagi 07–15", "Libur"
export function dayShiftLabel(entry: RosterEntry): string {
  return entry.kind === "off" ? "Libur" : `${entry.name} ${shortShiftRange(entry.startTime, entry.endTime)}`;
}

// Tooltip sel terkunci (design attendance-roster "LockedCellTooltip")
export function rosterLockLabel(lock: RosterLockReason): string {
  return lock === "attended" ? "Sudah absen · koreksi lewat Koreksi absensi" : ROSTER_LOCK_LABELS[lock];
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"] as const;
const DAYS_SHORT = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"] as const;
const DAYS_LONG = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"] as const;

function parts(isoDate: string): { day: number; month: string; year: number; weekday: number } {
  const date = new Date(`${isoDate}T00:00:00Z`);
  return { day: date.getUTCDate(), month: MONTHS[date.getUTCMonth()] ?? "", year: date.getUTCFullYear(), weekday: date.getUTCDay() };
}

export function addIsoDays(isoDate: string, days: number): string {
  return new Date(Date.parse(`${isoDate}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

// "5–11 Okt 2026", "28 Sep–4 Okt 2026"
export function weekRangeLabel(from: string, to: string): string {
  const a = parts(from);
  const b = parts(to);
  if (a.month === b.month && a.year === b.year) return `${a.day}–${b.day} ${b.month} ${b.year}`;
  return a.year === b.year ? `${a.day} ${a.month}–${b.day} ${b.month} ${b.year}` : `${a.day} ${a.month} ${a.year}–${b.day} ${b.month} ${b.year}`;
}

// "Sen 5"
export function rosterDayHeader(isoDate: string): { weekday: string; day: string } {
  const p = parts(isoDate);
  return { weekday: DAYS_SHORT[p.weekday] ?? "", day: String(p.day) };
}

// "Rabu, 7 Okt" (popover) / "Rabu, 7 Okt 2026" (sheet)
export function rosterDayTitle(isoDate: string, withYear = false): string {
  const p = parts(isoDate);
  return `${DAYS_LONG[p.weekday] ?? ""}, ${p.day} ${p.month}${withYear ? ` ${p.year}` : ""}`;
}

// "Sen 5 Okt" (Jadwal saya)
export function scheduleDayLabel(isoDate: string): string {
  const p = parts(isoDate);
  return `${DAYS_SHORT[p.weekday] ?? ""} ${p.day} ${p.month}`;
}

export function rosterHref(options: { week?: string | null; departmentId?: string | null }): string {
  const params = new URLSearchParams();
  if (options.week) params.set("week", options.week);
  if (options.departmentId) params.set("departmentId", options.departmentId);
  const query = params.toString();
  return query ? `/attendance/roster?${query}` : "/attendance/roster";
}

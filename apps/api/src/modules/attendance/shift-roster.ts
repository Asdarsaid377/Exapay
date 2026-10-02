import { isOvernightShift, ROSTER_DAYS, type RosterEntry, type RosterLockReason } from "@exapay/shared";

// Aturan roster shift (feature 46) — fungsi murni: tanggal string YYYY-MM-DD (dihitung UTC), "hari ini" sebagai input.

const DAY_MS = 86_400_000;

export function addDays(isoDate: string, days: number): string {
  return new Date(Date.parse(`${isoDate}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

// Senin dari minggu yang memuat tanggal ini (minggu Sen–Min)
export function weekStartOf(isoDate: string): string {
  const weekday = new Date(`${isoDate}T00:00:00Z`).getUTCDay();
  return addDays(isoDate, -((weekday + 6) % 7));
}

export function weekDates(weekStart: string, days = ROSTER_DAYS): string[] {
  return Array.from({ length: days }, (_, index) => addDays(weekStart, index));
}

export type FinalRange = { from: string; to: string };

export type LockFacts = {
  today: string;
  joinDate: string;
  endDate: string | null;
  // Karyawan sudah absen masuk di tanggal itu
  attended: boolean;
  finalRanges: readonly FinalRange[];
};

// Sel terkunci tidak bisa diubah dari roster (koreksi lewat koreksi absensi). Urutan alasan = yang paling menjelaskan.
export function rosterLockReason(date: string, facts: LockFacts): RosterLockReason | null {
  if (date < facts.joinDate || (facts.endDate !== null && date > facts.endDate)) return "not_employed";
  if (facts.finalRanges.some((range) => date >= range.from && date <= range.to)) return "payroll_final";
  if (facts.attended) return "attended";
  if (date < facts.today) return "past";
  return null;
}

export type RosterRow = { workShiftId: string | null; shiftName: string | null; startTime: string | null; endTime: string | null };

// Kolom `time` dibaca "08:00:00" → "08:00"
function hhmm(value: string): string {
  return value.slice(0, 5);
}

export function rosterEntryOf(row: RosterRow): RosterEntry {
  if (row.shiftName === null || row.startTime === null || row.endTime === null) return { kind: "off" };
  const startTime = hhmm(row.startTime);
  const endTime = hhmm(row.endTime);
  return { kind: "shift", shiftId: row.workShiftId, name: row.shiftName, startTime, endTime, overnight: isOvernightShift(startTime, endTime) };
}

// Ringkasan audit / email: "Pagi 07:00–15:00", "Libur", "—" (belum diatur)
export function rosterEntryText(entry: RosterEntry | null): string {
  if (!entry) return "—";
  if (entry.kind === "off") return "Libur";
  return `${entry.name} ${entry.startTime}–${entry.endTime}${entry.overnight ? " (+1)" : ""}`;
}

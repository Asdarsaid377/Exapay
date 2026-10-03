import { SHIFT_CHECK_IN_EARLY_MINUTES } from "@exapay/shared";

import { zonedInstant } from "./attendance-clock.js";
import { addDays } from "./shift-roster.js";

// Absensi karyawan mode shift (feature 47) — fungsi murni: jam server, zona waktu, roster & absen yang ada dikirim sebagai input.
//
// - Absen masuk dicocokkan ke shift kemarin (hanya shift malam yang belum selesai), hari ini, atau besok (shift lewat tengah
//   malam yang dibuka 2 jam sebelumnya). Tanggal kerja = tanggal mulai shift; telat dari jam mulai shift.
// - Absen masuk paling cepat SHIFT_CHECK_IN_EARLY_MINUTES sebelum mulai — lebih awal ditolak.
// - Hari tanpa shift (libur / roster belum diatur) → absen tetap diterima di tanggal hari ini + tanda "Tanpa jadwal".
// - Absen pulang: absen hari ini; bila belum ada, absen shift malam kemarin yang belum pulang (sampai shift hari ini mulai).

const MINUTE_MS = 60_000;
const EARLY_MS = SHIFT_CHECK_IN_EARLY_MINUTES * MINUTE_MS;
// Absen pulang shift malam yang lupa ditutup tidak menahan kartu absen selamanya: paling lama 12 jam setelah shift selesai
const OVERNIGHT_CHECK_OUT_GRACE_MS = 12 * 60 * MINUTE_MS;

export type ShiftTimes = { name: string; startTime: string; endTime: string };

export type ShiftWindow = ShiftTimes & {
  workDate: string;
  startAt: Date;
  endAt: Date;
};

export type ShiftDayFacts = {
  // Isi roster per tanggal: shift, "off" (libur), tidak ada = belum diatur. Minimal kemarin–besok.
  roster: ReadonlyMap<string, ShiftTimes | "off">;
  // Tanggal kerja yang sudah punya absen masuk: sudah pulang? + jam jadwal snapshot ("HH:MM", null = tanpa jadwal)
  records: ReadonlyMap<string, { checkedOut: boolean; scheduledStart: string | null; scheduledEnd: string | null }>;
};

export type CheckInMatch =
  | { kind: "shift"; shift: ShiftWindow; lateMinutes: number }
  | { kind: "too_early"; shift: ShiftWindow; opensAt: Date }
  | { kind: "unscheduled"; workDate: string };

function isOvernight(startTime: string, endTime: string): boolean {
  return endTime <= startTime;
}

export function shiftWindow(workDate: string, shift: ShiftTimes, timeZone: string): ShiftWindow {
  const endDate = isOvernight(shift.startTime, shift.endTime) ? addDays(workDate, 1) : workDate;
  return { ...shift, workDate, startAt: zonedInstant(workDate, shift.startTime, timeZone), endAt: zonedInstant(endDate, shift.endTime, timeZone) };
}

// Menit telat penuh dari jam mulai shift (08:00:59 = 0) — berbasis instant agar benar untuk absen setelah tengah malam
export function shiftLateMinutes(checkInAt: Date, startAt: Date): number {
  return Math.max(0, Math.floor((checkInAt.getTime() - startAt.getTime()) / MINUTE_MS));
}

function windowOf(facts: ShiftDayFacts, date: string, timeZone: string): ShiftWindow | null {
  const entry = facts.roster.get(date);
  return entry && entry !== "off" ? shiftWindow(date, entry, timeZone) : null;
}

export function matchCheckIn(now: Date, today: string, timeZone: string, facts: ShiftDayFacts): CheckInMatch {
  const yesterday = windowOf(facts, addDays(today, -1), timeZone);
  const current = windowOf(facts, today, timeZone);
  const tomorrow = windowOf(facts, addDays(today, 1), timeZone);
  const at = now.getTime();
  const open = (shift: ShiftWindow): boolean => !facts.records.has(shift.workDate) && at >= shift.startAt.getTime() - EARLY_MS;

  const eligible = [
    // Shift kemarin hanya selama belum selesai (shift malam)
    yesterday && at < yesterday.endAt.getTime() && open(yesterday) ? yesterday : null,
    // Shift hari ini terbuka sejak 2 jam sebelum mulai — absen sangat telat tetap dicocokkan ke shift ini
    current && open(current) ? current : null,
    tomorrow && open(tomorrow) ? tomorrow : null,
  ].filter((shift): shift is ShiftWindow => shift !== null);

  // Beberapa jendela terbuka (mis. pulang shift malam berdekatan dengan shift pagi) → jam mulai terdekat
  const [best] = eligible.sort((a, b) => Math.abs(at - a.startAt.getTime()) - Math.abs(at - b.startAt.getTime()));
  if (best) return { kind: "shift", shift: best, lateMinutes: shiftLateMinutes(now, best.startAt) };
  if (current && !facts.records.has(today)) return { kind: "too_early", shift: current, opensAt: new Date(current.startAt.getTime() - EARLY_MS) };
  return { kind: "unscheduled", workDate: today };
}

// Absen shift malam kemarin yang belum pulang masih menjadi kartu aktif: sampai shift hari ini mulai, paling lama 12 jam
// setelah shift malam selesai. Hari ini sudah punya absen → kartu hari ini.
export function openOvernightDate(now: Date, today: string, timeZone: string, facts: ShiftDayFacts): string | null {
  if (facts.records.has(today)) return null;
  const date = addDays(today, -1);
  const record = facts.records.get(date);
  // Jam shift dari snapshot absen (bukan roster saat ini)
  if (!record || record.checkedOut || record.scheduledStart === null || record.scheduledEnd === null) return null;
  if (!isOvernight(record.scheduledStart, record.scheduledEnd)) return null;
  const shift = shiftWindow(date, { name: "", startTime: record.scheduledStart, endTime: record.scheduledEnd }, timeZone);
  const at = now.getTime();
  const current = windowOf(facts, today, timeZone);
  if (current && at >= current.startAt.getTime()) return null;
  return at < shift.endAt.getTime() + OVERNIGHT_CHECK_OUT_GRACE_MS ? date : null;
}

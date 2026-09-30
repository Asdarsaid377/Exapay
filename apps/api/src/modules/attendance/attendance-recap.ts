import type { AttendanceDayStatus, AttendanceRecapSummary, LeaveType } from "@exapay/shared";

import { isWorkingDay, type WorkCalendar } from "./work-calendar.js";

// Rekap absensi satu karyawan (feature 16) — fungsi murni: tanpa DB, tanpa tanggal sistem (hari ini dikirim sebagai input).
// Dipakai rekap /attendance, rincian harian koreksi, dan nanti potongan absensi payroll (feature 27).
//
// Aturan per tanggal (tanggal kalender YYYY-MM-DD, zona waktu usaha):
// - Di luar masa kerja (sebelum tanggal masuk / setelah tanggal keluar) → not_employed, tidak dihitung
// - Ada absen: hari kerja → on_time/late (menit telat dari snapshot saat absen); bukan hari kerja → off_day_present
// - Tanpa absen, hari kerja: izin disetujui → permit/sick/leave; sebelum hari ini → absent (alpa); hari ini/mendatang → pending
// - Tanpa absen, bukan hari kerja → off
// Hari kerja mengikuti kalender kerja saat ini (jadwal tidak berversi — keputusan feature 13).

export type RecapRecord = {
  workDate: string;
  lateMinutes: number;
  hasCheckOut: boolean;
};

export type RecapLeave = {
  type: LeaveType;
  startDate: string;
  endDate: string;
};

export type RecapEmployment = {
  joinDate: string;
  // Tanggal keluar = hari terakhir masa kerja (inklusif)
  endDate: string | null;
};

export type RecapInput = {
  calendar: WorkCalendar;
  from: string;
  to: string;
  today: string;
  employment: RecapEmployment;
  records: readonly RecapRecord[];
  // Hanya pengajuan yang disetujui
  leaves: readonly RecapLeave[];
};

export type RecapDay = {
  date: string;
  status: AttendanceDayStatus;
};

export type RecapResult = {
  days: RecapDay[];
  summary: AttendanceRecapSummary;
};

const DAY_MS = 86_400_000;

function datesBetween(from: string, to: string): string[] {
  const dates: string[] = [];
  for (let ms = Date.parse(`${from}T00:00:00Z`), end = Date.parse(`${to}T00:00:00Z`); ms <= end; ms += DAY_MS) {
    dates.push(new Date(ms).toISOString().slice(0, 10));
  }
  return dates;
}

export function emptySummary(): AttendanceRecapSummary {
  return { workingDays: 0, present: 0, late: 0, lateMinutes: 0, absent: 0, permit: 0, sick: 0, leave: 0, offDayPresent: 0, missingCheckOut: 0 };
}

export function recapEmployee(input: RecapInput): RecapResult {
  const { calendar, today, employment } = input;
  const recordByDate = new Map(input.records.map((record) => [record.workDate, record]));
  const summary = emptySummary();
  const days: RecapDay[] = [];

  for (const date of datesBetween(input.from, input.to)) {
    if (date < employment.joinDate || (employment.endDate !== null && date > employment.endDate)) {
      days.push({ date, status: "not_employed" });
      continue;
    }
    const workday = isWorkingDay(calendar, date);
    if (workday) summary.workingDays += 1;
    const record = recordByDate.get(date);

    if (record) {
      if (!record.hasCheckOut && date < today) summary.missingCheckOut += 1;
      if (!workday) {
        summary.offDayPresent += 1;
        days.push({ date, status: "off_day_present" });
        continue;
      }
      summary.present += 1;
      if (record.lateMinutes > 0) {
        summary.late += 1;
        summary.lateMinutes += record.lateMinutes;
        days.push({ date, status: "late" });
      } else {
        days.push({ date, status: "on_time" });
      }
      continue;
    }

    if (!workday) {
      days.push({ date, status: "off" });
      continue;
    }
    // Pengajuan disetujui tidak pernah beririsan (exclusion constraint) — paling banyak satu yang cocok
    const leave = input.leaves.find((item) => item.startDate <= date && item.endDate >= date);
    if (leave) {
      summary[leave.type] += 1;
      days.push({ date, status: leave.type });
    } else if (date < today) {
      summary.absent += 1;
      days.push({ date, status: "absent" });
    } else {
      days.push({ date, status: "pending" });
    }
  }
  return { days, summary };
}

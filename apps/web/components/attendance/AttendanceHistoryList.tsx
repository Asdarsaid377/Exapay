import { type AttendanceRecord, LEAVE_TYPE_LABELS, type MyLeaveRequests } from "@exapay/shared";

import { CalendarDate } from "@/components/attendance/CalendarDate";
import { Badge } from "@/components/common/Badge";
import { ATTENDANCE_STATUS_TONES, attendanceStatusLabel, formatClockTime } from "@/lib/attendanceLabels";
import { weekdayLabelOf } from "@/lib/workCalendarLabels";

type LeaveDay = MyLeaveRequests["leaveDays"][number];

type Props = {
  records: AttendanceRecord[];
  // Hari kerja tertutup izin/sakit/cuti yang disetujui (feature 15)
  leaveDays: LeaveDay[];
  timeZone: string;
  // Tanggal hari ini (YYYY-MM-DD) — hari ini tanpa absen pulang belum dianggap lupa
  today: string;
};

type Entry = { kind: "record"; date: string; record: AttendanceRecord } | { kind: "leave"; date: string; leave: LeaveDay };

// Daftar absen & hari izin per tanggal (portal), terbaru di atas. Card solid — portal maks 3 lapisan blur.
// Pola baris daftar libur (CalendarDate + judul + sub).
export function AttendanceHistoryList({ records, leaveDays, timeZone, today }: Props) {
  const entries: Entry[] = [
    ...records.map((record): Entry => ({ kind: "record", date: record.workDate, record })),
    ...leaveDays.map((leave): Entry => ({ kind: "leave", date: leave.date, leave })),
  ].sort((a, b) => b.date.localeCompare(a.date) || (a.kind === "record" ? -1 : 1));

  return (
    <section aria-labelledby="attendance-history-title" className="surface-solid flex flex-col rounded-card px-4.5 pt-4.5 pb-1.5">
      <h2 id="attendance-history-title" className="mb-1 font-display text-[17px] font-bold tracking-[-0.01em] text-text-primary">
        Riwayat
      </h2>
      <ul>
        {entries.map((entry) => (
          <li key={`${entry.kind}-${entry.date}`} className="flex items-center gap-3.5 border-t border-border-subtle py-3.5 first:border-t-0">
            <CalendarDate date={entry.date} />
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-[14.5px] font-bold text-text-primary">{weekdayLabelOf(entry.date)}</span>
              {entry.kind === "record" ? (
                <span className="text-small text-text-secondary tabular-nums">
                  Masuk {formatClockTime(entry.record.checkInAt, timeZone)} ·{" "}
                  {entry.record.checkOutAt
                    ? `Pulang ${formatClockTime(entry.record.checkOutAt, timeZone)}`
                    : entry.record.workDate === today
                      ? "Belum pulang"
                      : "Tanpa absen pulang"}
                </span>
              ) : (
                <span className="text-small text-text-secondary">Pengajuan disetujui</span>
              )}
            </div>
            {entry.kind === "record" ? (
              <Badge tone={ATTENDANCE_STATUS_TONES[entry.record.status]}>{attendanceStatusLabel(entry.record)}</Badge>
            ) : (
              <Badge tone="info">{LEAVE_TYPE_LABELS[entry.leave.type]}</Badge>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

import type { AttendanceRecord } from "@exapay/shared";

import { CalendarDate } from "@/components/attendance/CalendarDate";
import { Badge } from "@/components/common/Badge";
import { ATTENDANCE_STATUS_TONES, attendanceStatusLabel, formatClockTime } from "@/lib/attendanceLabels";
import { weekdayLabelOf } from "@/lib/workCalendarLabels";

type Props = {
  records: AttendanceRecord[];
  timeZone: string;
  // Tanggal hari ini (YYYY-MM-DD) — hari ini tanpa absen pulang belum dianggap lupa
  today: string;
};

// Daftar absen per hari (portal). Card solid — portal maks 3 lapisan blur. Pola baris daftar libur (CalendarDate + judul + sub).
export function AttendanceHistoryList({ records, timeZone, today }: Props) {
  return (
    <section aria-labelledby="attendance-history-title" className="surface-solid flex flex-col rounded-card px-4.5 pt-4.5 pb-1.5">
      <h2 id="attendance-history-title" className="mb-1 font-display text-[17px] font-bold tracking-[-0.01em] text-text-primary">
        Riwayat
      </h2>
      <ul>
        {records.map((record) => (
          <li key={record.id} className="flex items-center gap-3.5 border-t border-border-subtle py-3.5 first:border-t-0">
            <CalendarDate date={record.workDate} />
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-[14.5px] font-bold text-text-primary">{weekdayLabelOf(record.workDate)}</span>
              <span className="text-small text-text-secondary tabular-nums">
                Masuk {formatClockTime(record.checkInAt, timeZone)} ·{" "}
                {record.checkOutAt
                  ? `Pulang ${formatClockTime(record.checkOutAt, timeZone)}`
                  : record.workDate === today
                    ? "Belum pulang"
                    : "Tanpa absen pulang"}
              </span>
            </div>
            <Badge tone={ATTENDANCE_STATUS_TONES[record.status]}>{attendanceStatusLabel(record)}</Badge>
          </li>
        ))}
      </ul>
    </section>
  );
}

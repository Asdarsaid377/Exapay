import type { AttendanceCorrection } from "@exapay/shared";
import type { ReactNode } from "react";

import { CalendarDate } from "@/components/attendance/CalendarDate";
import { formatClockTime } from "@/lib/attendanceLabels";
import { formatDateTime } from "@/lib/datetime";
import { weekdayLabelOf } from "@/lib/workCalendarLabels";

type Props = {
  items: AttendanceCorrection[];
  timeZone: string;
  // Tampilkan nama karyawan (riwayat semua karyawan)
  showEmployee: boolean;
  footer?: ReactNode;
};

function clock(value: string | null, timeZone: string): string {
  return value ? formatClockTime(value, timeZone) : "–";
}

// "08:30 → 08:00"; tidak berubah → cukup satu jam
function change(before: string | null, after: string | null, timeZone: string): string {
  const from = clock(before, timeZone);
  const to = clock(after, timeZone);
  return from === to ? to : `${from} → ${to}`;
}

// Riwayat koreksi absensi (feature 16), terbaru di atas: tanggal kerja, perubahan jam, alasan, pengoreksi.
// Tanpa referensi desain — pola baris daftar CalendarDate (izin user).
export function AttendanceCorrectionList({ items, timeZone, showEmployee, footer }: Props) {
  return (
    <section aria-labelledby="corrections-title" className="glass-data flex flex-col rounded-card px-4.5 pt-4.5 lg:px-6 lg:pt-5.5">
      <h2 id="corrections-title" className="mb-1 font-display text-[17px] font-bold tracking-[-0.01em] text-text-primary">
        Riwayat koreksi
      </h2>
      <ul>
        {items.map((item) => (
          <li key={item.id} className="flex gap-3 border-t border-border-subtle py-3.5 first:border-t-0 sm:gap-3.5">
            <CalendarDate date={item.workDate} />
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="text-[14.5px] font-bold text-text-primary">
                {showEmployee ? `${item.employee.fullName} · ` : ""}
                {weekdayLabelOf(item.workDate)}
              </span>
              <span className="text-small text-text-secondary tabular-nums">
                {item.before.checkInAt === null
                  ? `Absen ditambahkan · Masuk ${clock(item.after.checkInAt, timeZone)} · Pulang ${clock(item.after.checkOutAt, timeZone)}`
                  : `Masuk ${change(item.before.checkInAt, item.after.checkInAt, timeZone)} · Pulang ${change(item.before.checkOutAt, item.after.checkOutAt, timeZone)}`}
              </span>
              <p className="text-sm text-pretty break-words text-text-primary">{item.reason}</p>
              <span className="text-caption text-text-tertiary">
                {item.correctedByName ? `Oleh ${item.correctedByName} · ` : ""}
                {formatDateTime(item.createdAt, timeZone)}
              </span>
            </div>
          </li>
        ))}
      </ul>
      {footer ? <div className="border-t border-border-subtle py-3">{footer}</div> : null}
    </section>
  );
}

import type { EmployeeAttendanceDays } from "@exapay/shared";

import { CalendarDate } from "@/components/attendance/CalendarDate";
import { CorrectAttendanceButton } from "@/components/attendance/CorrectAttendanceButton";
import { Badge } from "@/components/common/Badge";
import { EmployeeAvatar } from "@/components/employees/EmployeeAvatar";
import { formatClockTime, formatDuration } from "@/lib/attendanceLabels";
import { DAY_STATUS_TONES, dayStatusLabel } from "@/lib/attendanceRecapLabels";
import { weekdayLabelOf } from "@/lib/workCalendarLabels";

type Props = {
  // canCorrect = owner/admin & bukan absensinya sendiri (API tetap menolak)
  data: EmployeeAttendanceDays;
  // Nama & jabatan di kepala card — disembunyikan di tab Absensi detail karyawan (sudah ada di header halaman, feature 37b)
  showEmployee?: boolean;
};

// Rincian harian satu karyawan + tombol koreksi per tanggal (feature 16). Terbaru di atas; tanggal mendatang disembunyikan.
// Tanpa referensi desain — pola AttendanceHistoryList (CalendarDate + judul + sub + Badge) di card glass-data (izin user).
export function AttendanceDayList({ data, showEmployee = true }: Props) {
  const { employee, summary, timeZone, today, canCorrect } = data;
  const days = data.days.filter((day) => day.date <= today && day.status !== "not_employed").reverse();
  const facts = [
    `Hadir ${summary.present}/${summary.workingDays}`,
    `Telat ${summary.late}×${summary.late > 0 ? ` (${formatDuration(summary.lateMinutes)})` : ""}`,
    `Alpa ${summary.absent}`,
    `Izin ${summary.permit} · Sakit ${summary.sick} · Cuti ${summary.leave}`,
    summary.missingCheckOut > 0 ? `Tanpa absen pulang ${summary.missingCheckOut}` : null,
  ].filter((fact): fact is string => fact !== null);

  return (
    <section aria-labelledby="attendance-days-title" className="glass-data flex flex-col rounded-card px-4.5 pt-4.5 pb-1.5 lg:px-6 lg:pt-5.5">
      {showEmployee ? (
        <div className="flex items-center gap-3">
          <EmployeeAvatar fullName={employee.fullName} size="md" inactive={employee.endDate !== null} />
          <div className="flex min-w-0 flex-col">
            <h2 id="attendance-days-title" className="truncate font-display text-[17px] font-bold tracking-[-0.01em] text-text-primary">
              {employee.fullName}
            </h2>
            <span className="truncate text-small text-text-secondary">
              {employee.positionName} · {employee.departmentName}
            </span>
          </div>
        </div>
      ) : (
        <h2 id="attendance-days-title" className="font-display text-[17px] font-bold tracking-[-0.01em] text-text-primary">
          Rincian harian
        </h2>
      )}
      <p className="mt-3 text-small text-text-secondary tabular-nums">{facts.join(" · ")}</p>
      {days.length === 0 ? (
        <p className="border-t border-border-subtle py-6 mt-3 text-center text-sm text-text-secondary">Periode ini belum berjalan atau di luar masa kerja karyawan.</p>
      ) : (
        <ul className="mt-2">
          {days.map((day) => {
            const label = dayStatusLabel(day.status, day.record?.lateMinutes ?? 0, day.date === today);
            const record = day.record;
            return (
              <li key={day.date} className="flex items-center gap-3 border-t border-border-subtle py-3 sm:gap-3.5">
                <CalendarDate date={day.date} muted={day.status === "off"} />
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="text-[14.5px] font-bold text-text-primary">{weekdayLabelOf(day.date)}</span>
                  {record ? (
                    <span className="text-small text-text-secondary tabular-nums">
                      Masuk {formatClockTime(record.checkInAt, timeZone)} ·{" "}
                      {record.checkOutAt ? `Pulang ${formatClockTime(record.checkOutAt, timeZone)}` : day.date === today ? "Belum pulang" : "Tanpa absen pulang"}
                    </span>
                  ) : null}
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <Badge tone={DAY_STATUS_TONES[day.status]}>{label}</Badge>
                    {day.corrected ? <span className="text-caption text-text-tertiary">Dikoreksi</span> : null}
                  </div>
                </div>
                {canCorrect ? <CorrectAttendanceButton employee={employee} day={day} statusLabel={label} timeZone={timeZone} /> : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

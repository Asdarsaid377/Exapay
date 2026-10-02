"use client";

import { type AttendanceDay, type AttendanceEvent, type EmployeeAttendanceDays, isAttendanceFlag } from "@exapay/shared";
import { useState } from "react";

import { CorrectAttendanceButton } from "@/components/attendance/CorrectAttendanceButton";
import { Badge } from "@/components/common/Badge";
import { EmployeeAvatar } from "@/components/employees/EmployeeAvatar";
import { SelfieThumb } from "@/components/selfie/SelfieThumb";
import { type SelfieShot, SelfieViewer } from "@/components/selfie/SelfieViewer";
import { formatClockTime, formatDuration } from "@/lib/attendanceLabels";
import { DAY_STATUS_TONES, dayStatusLabel } from "@/lib/attendanceRecapLabels";
import { formatIsoDate } from "@/lib/datetime";
import { SELFIE_EVENT_LABELS, selfieSrc } from "@/lib/selfies";
import { weekdayLabelOf } from "@/lib/workCalendarLabels";
import { FLAG_TONES, flagLabel } from "@/lib/workLocationLabels";

type Props = {
  // canCorrect = owner/admin & bukan absensinya sendiri (API tetap menolak)
  data: EmployeeAttendanceDays;
  // Nama & jabatan di kepala card — disembunyikan di tab Absensi detail karyawan (sudah ada di header halaman, feature 37b)
  showEmployee?: boolean;
};

type DayRecord = NonNullable<AttendanceDay["record"]>;

const GRID = "lg:grid lg:grid-cols-[150px_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.2fr)_110px] lg:gap-4";

// Rincian harian satu karyawan + tombol koreksi per tanggal (feature 16). Terbaru di atas; tanggal mendatang disembunyikan.
// Selfie (feature 45, design attendance-selfie-detail): desktop = tabel Tanggal | Masuk | Pulang | Status, tiap jam dengan
// thumbnail selfie + tanda lokasi; mobile = daftar dengan thumbnail di kanan. Klik thumbnail → SelfieViewer.
export function AttendanceDayList({ data, showEmployee = true }: Props) {
  const { employee, summary, timeZone, today, canCorrect } = data;
  const [viewing, setViewing] = useState<{ record: DayRecord; date: string; event: AttendanceEvent } | null>(null);
  const days = data.days.filter((day) => day.date <= today && day.status !== "not_employed").reverse();
  const facts = [
    `Hadir ${summary.present}/${summary.workingDays}`,
    `Telat ${summary.late}×${summary.late > 0 ? ` (${formatDuration(summary.lateMinutes)})` : ""}`,
    `Alpa ${summary.absent}`,
    `Izin ${summary.permit} · Sakit ${summary.sick} · Cuti ${summary.leave}`,
    summary.missingCheckOut > 0 ? `Tanpa absen pulang ${summary.missingCheckOut}` : null,
  ].filter((fact): fact is string => fact !== null);

  const open = (record: DayRecord, date: string, event: AttendanceEvent): void => setViewing({ record, date, event });

  return (
    <section aria-labelledby="attendance-days-title" className="glass-data flex flex-col rounded-card px-4.5 pt-4.5 pb-1.5 lg:px-0 lg:pt-5.5 lg:pb-0">
      <div className="lg:px-6">
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
      </div>
      {days.length === 0 ? (
        <p className="mt-3 border-t border-border-subtle py-6 text-center text-sm text-text-secondary">Periode ini belum berjalan atau di luar masa kerja karyawan.</p>
      ) : (
        <>
          <div className={`mt-3 hidden h-11 items-center border-y border-border-subtle bg-table-head px-5 text-caption font-bold text-text-secondary ${GRID}`}>
            <span>Tanggal</span>
            <span>Masuk</span>
            <span>Pulang</span>
            <span>Status</span>
            <span className="sr-only">Aksi</span>
          </div>
          <ul className="mt-2 lg:mt-0">
            {days.map((day) => {
              const label = dayStatusLabel(day.status, day.record?.lateMinutes ?? 0, day.date === today);
              const record = day.record;
              const statusBadges = (
                <>
                  <Badge tone={DAY_STATUS_TONES[day.status]}>{label}</Badge>
                  {day.corrected ? (
                    <span className="inline-flex h-6.5 items-center rounded-full border border-border-outline px-2.5 text-[12.5px] font-bold text-text-secondary">Dikoreksi</span>
                  ) : null}
                </>
              );
              const correct = canCorrect ? <CorrectAttendanceButton employee={employee} day={day} statusLabel={label} timeZone={timeZone} /> : null;
              return (
                <li key={day.date} className="border-t border-border-subtle first:border-t-0 lg:first:border-t-0">
                  {/* Desktop: baris tabel */}
                  <div className={`hidden min-h-16 items-center px-5 py-2.5 ${GRID}`}>
                    <div className="flex flex-col gap-px">
                      <span className="text-[14.5px] font-bold text-text-primary tabular-nums">{formatIsoDate(day.date)}</span>
                      <span className="text-caption text-text-tertiary">{weekdayLabelOf(day.date)}</span>
                    </div>
                    <TimeCell record={record} event="check_in" timeZone={timeZone} onOpen={() => record && open(record, day.date, "check_in")} />
                    <TimeCell
                      record={record}
                      event="check_out"
                      timeZone={timeZone}
                      pendingText={day.date === today ? "Belum pulang" : null}
                      onOpen={() => record && open(record, day.date, "check_out")}
                    />
                    <div className="flex flex-wrap items-center gap-2">{statusBadges}</div>
                    <div className="justify-self-end">{correct}</div>
                  </div>

                  {/* Mobile: daftar */}
                  <div className="flex items-center gap-3 py-2.5 lg:hidden">
                    <div className="flex w-13.5 shrink-0 flex-col">
                      <span className="font-display text-[14.5px] font-bold text-text-primary tabular-nums">{formatIsoDate(day.date).replace(/ \d{4}$/, "")}</span>
                      <span className="text-xs text-text-tertiary">{weekdayLabelOf(day.date)}</span>
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col items-start gap-1">
                      {record ? (
                        <span className="text-[14.5px] font-medium text-text-primary tabular-nums">
                          {formatClockTime(record.checkInAt, timeZone)} – {record.checkOutAt ? formatClockTime(record.checkOutAt, timeZone) : day.date === today ? "belum pulang" : "—"}
                        </span>
                      ) : null}
                      <div className="flex flex-wrap items-center gap-1.5">{statusBadges}</div>
                    </div>
                    {record ? <MobileSelfies record={record} onOpen={(event) => open(record, day.date, event)} /> : null}
                    {correct}
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
      {viewing ? (
        <SelfieViewer
          open
          onClose={() => setViewing(null)}
          title={employee.fullName}
          description={`${employee.positionName} · ${employee.departmentName}`}
          workDate={viewing.date}
          timeZone={timeZone}
          shots={shotsOf(viewing.record)}
          initialEvent={viewing.event}
        />
      ) : null}
    </section>
  );
}

function shotsOf(record: DayRecord): SelfieShot[] {
  const shots: SelfieShot[] = [];
  if (record.checkInSelfie) {
    shots.push({ event: "check_in", state: record.checkInSelfie, src: selfieSrc("staff", record.id, "check_in"), at: record.checkInAt, geofence: record.checkInGeofence });
  }
  if (record.checkOutSelfie && record.checkOutAt) {
    shots.push({ event: "check_out", state: record.checkOutSelfie, src: selfieSrc("staff", record.id, "check_out"), at: record.checkOutAt, geofence: record.checkOutGeofence });
  }
  return shots;
}

// Sel jam desktop: jam + thumbnail selfie (atau "Foto dihapus" / "—") + badge tanda lokasi bila bertanda
function TimeCell(props: { record: DayRecord | null; event: AttendanceEvent; timeZone: string; pendingText?: string | null; onOpen: () => void }) {
  const { record, event, timeZone, pendingText, onOpen } = props;
  const at = record ? (event === "check_in" ? record.checkInAt : record.checkOutAt) : null;
  if (!record || !at) return <span className="text-sm text-text-muted">{record && pendingText ? pendingText : "—"}</span>;
  const state = event === "check_in" ? record.checkInSelfie : record.checkOutSelfie;
  const geofence = event === "check_in" ? record.checkInGeofence : record.checkOutGeofence;
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <span className="w-11 text-[14.5px] font-medium text-text-primary tabular-nums">{formatClockTime(at, timeZone)}</span>
      <SelfieThumb
        state={state}
        src={selfieSrc("staff", record.id, event)}
        label={`Lihat selfie absen ${SELFIE_EVENT_LABELS[event].toLowerCase()}`}
        onOpen={onOpen}
        showNone
      />
      {geofence && isAttendanceFlag(geofence.status) ? <Badge tone={FLAG_TONES[geofence.status]}>{flagLabel(geofence.status)}</Badge> : null}
    </div>
  );
}

// Mobile: thumbnail masuk & pulang berdampingan; keduanya dihapus → "Foto dihapus"
function MobileSelfies({ record, onOpen }: { record: DayRecord; onOpen: (event: AttendanceEvent) => void }) {
  const states = [record.checkInSelfie, record.checkOutSelfie].filter((state) => state !== null);
  if (states.length === 0) return null;
  if (states.every((state) => state === "expired")) return <span className="shrink-0 text-caption text-text-muted">Foto dihapus</span>;
  return (
    <div className="flex shrink-0 gap-1.5">
      {(["check_in", "check_out"] as const).map((event) => {
        const state = event === "check_in" ? record.checkInSelfie : record.checkOutSelfie;
        if (state !== "available") return null;
        return (
          <SelfieThumb
            key={event}
            state={state}
            src={selfieSrc("staff", record.id, event)}
            label={`Lihat selfie absen ${SELFIE_EVENT_LABELS[event].toLowerCase()}`}
            onOpen={() => onOpen(event)}
          />
        );
      })}
    </div>
  );
}

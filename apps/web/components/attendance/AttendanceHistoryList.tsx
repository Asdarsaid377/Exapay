"use client";

import { type AttendanceEvent, type AttendanceRecord, LEAVE_TYPE_LABELS, type MyLeaveRequests } from "@exapay/shared";
import { useState } from "react";

import { CalendarDate } from "@/components/attendance/CalendarDate";
import { Badge } from "@/components/common/Badge";
import { SelfieThumb } from "@/components/selfie/SelfieThumb";
import { type SelfieShot, SelfieViewer } from "@/components/selfie/SelfieViewer";
import { ATTENDANCE_STATUS_TONES, attendanceStatusLabel, formatClockTime } from "@/lib/attendanceLabels";
import { formatIsoDate } from "@/lib/datetime";
import { selfieSrc } from "@/lib/selfies";
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
// Pola baris daftar libur (CalendarDate + judul + sub). Selfie (feature 45, design me-attendance-selfie Area 2):
// thumbnail masuk/pulang 36px di kanan → penampil foto; foto > 90 hari = "Foto dihapus".
export function AttendanceHistoryList({ records, leaveDays, timeZone, today }: Props) {
  const [viewing, setViewing] = useState<{ record: AttendanceRecord; event: AttendanceEvent } | null>(null);
  const hasSelfies = records.some((record) => record.checkInSelfie !== null || record.checkOutSelfie !== null);
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
            <div className="flex min-w-0 flex-1 flex-col items-start gap-1">
              <span className="text-[14.5px] font-bold text-text-primary">{weekdayLabelOf(entry.date)}</span>
              {entry.kind === "record" ? (
                <>
                  <span className="text-small text-text-secondary tabular-nums">
                    Masuk {formatClockTime(entry.record.checkInAt, timeZone)} ·{" "}
                    {entry.record.checkOutAt
                      ? `Pulang ${formatClockTime(entry.record.checkOutAt, timeZone)}`
                      : entry.record.workDate === today
                        ? "Belum pulang"
                        : "Tanpa absen pulang"}
                  </span>
                  <Badge tone={ATTENDANCE_STATUS_TONES[entry.record.status]}>{attendanceStatusLabel(entry.record)}</Badge>
                </>
              ) : (
                <>
                  <span className="text-small text-text-secondary">Pengajuan disetujui</span>
                  <Badge tone="info">{LEAVE_TYPE_LABELS[entry.leave.type]}</Badge>
                </>
              )}
            </div>
            {entry.kind === "record" ? <RecordSelfies record={entry.record} onOpen={(event) => setViewing({ record: entry.record, event })} /> : null}
          </li>
        ))}
      </ul>
      {hasSelfies ? (
        <p className="border-t border-border-subtle py-3 text-caption text-pretty text-text-tertiary">Foto disimpan 90 hari, lalu dihapus otomatis. Absen tetap tercatat.</p>
      ) : null}
      {viewing ? (
        <SelfieViewer
          open
          onClose={() => setViewing(null)}
          title={`Selfie absen ${viewing.event === "check_out" ? "pulang" : "masuk"}`}
          workDate={viewing.record.workDate}
          timeZone={timeZone}
          shots={shotsOf(viewing.record)}
          initialEvent={viewing.event}
        />
      ) : null}
    </section>
  );
}

function shotsOf(record: AttendanceRecord): SelfieShot[] {
  const shots: SelfieShot[] = [];
  if (record.checkInSelfie) shots.push({ event: "check_in", state: record.checkInSelfie, src: selfieSrc("portal", record.id, "check_in"), at: record.checkInAt });
  if (record.checkOutSelfie && record.checkOutAt) {
    shots.push({ event: "check_out", state: record.checkOutSelfie, src: selfieSrc("portal", record.id, "check_out"), at: record.checkOutAt });
  }
  return shots;
}

// Kedua foto sudah dihapus → satu teks "Foto dihapus"; selain itu thumbnail per foto yang ada
function RecordSelfies({ record, onOpen }: { record: AttendanceRecord; onOpen: (event: AttendanceEvent) => void }) {
  const states = [record.checkInSelfie, record.checkOutSelfie].filter((state) => state !== null);
  if (states.length === 0) return null;
  if (states.every((state) => state === "expired")) return <span className="shrink-0 text-caption text-text-muted">Foto dihapus</span>;
  const date = formatIsoDate(record.workDate);
  return (
    <div className="flex shrink-0 gap-1.5">
      {(["check_in", "check_out"] as const).map((event) => {
        const state = event === "check_in" ? record.checkInSelfie : record.checkOutSelfie;
        if (state !== "available") return null;
        return (
          <SelfieThumb
            key={event}
            state={state}
            size="md"
            src={selfieSrc("portal", record.id, event)}
            label={`Lihat selfie absen ${event === "check_in" ? "masuk" : "pulang"} ${date}`}
            onOpen={() => onOpen(event)}
          />
        );
      })}
    </div>
  );
}

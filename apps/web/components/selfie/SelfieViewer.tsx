"use client";

import { type AttendanceEvent, type GeofenceResult, isAttendanceFlag, type SelfieState, timeZoneLabel } from "@exapay/shared";
import { useEffect, useState } from "react";

import { AttendanceFlag } from "@/components/attendance/AttendanceFlag";
import { Button } from "@/components/common/Button";
import { Dialog } from "@/components/common/Dialog";
import { SegmentedControl } from "@/components/common/SegmentedControl";
import { formatClockTime } from "@/lib/attendanceLabels";
import { formatLongDate } from "@/lib/datetime";
import { SELFIE_EVENT_LABELS } from "@/lib/selfies";

export type SelfieShot = {
  event: AttendanceEvent;
  state: SelfieState;
  src: string;
  // Jam absen (ISO)
  at: string;
  geofence?: GeofenceResult | null;
};

type Props = {
  open: boolean;
  onClose: () => void;
  // Nama karyawan (staf) atau "Selfie absen masuk" (portal)
  title: string;
  description?: string;
  // Tanggal kerja YYYY-MM-DD
  workDate: string;
  timeZone: string;
  // Foto yang tersedia (ada / sudah dihapus) — lebih dari satu → pindah Masuk ↔ Pulang
  shots: SelfieShot[];
  initialEvent: AttendanceEvent;
};

// Penampil foto selfie (design selfie-components "SelfieViewer"): desktop dialog 800px foto 360×450 + info,
// mobile sheet (Dialog menempel di bawah). Gagal dimuat → pesan + "Coba lagi". Tanpa pengenalan wajah.
export function SelfieViewer({ open, onClose, title, description, workDate, timeZone, shots, initialEvent }: Props) {
  const [event, setEvent] = useState<AttendanceEvent>(initialEvent);
  const [status, setStatus] = useState<"loading" | "ready" | "failed">("loading");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (open) setEvent(initialEvent);
  }, [open, initialEvent]);

  const shot = shots.find((candidate) => candidate.event === event) ?? shots[0];
  useEffect(() => {
    setStatus("loading");
  }, [shot?.src, attempt]);

  if (!shot) return null;
  const when = `${SELFIE_EVENT_LABELS[shot.event]} · ${formatLongDate(new Date(`${workDate}T12:00:00Z`), "UTC")} · ${formatClockTime(shot.at, timeZone)} ${timeZoneLabel(timeZone)}`;
  const flag = shot.geofence && isAttendanceFlag(shot.geofence.status) ? shot.geofence : null;

  return (
    <Dialog open={open} onClose={onClose} title={title} description={description} size="lg">
      <div className="grid gap-4 sm:grid-cols-[minmax(0,360px)_minmax(0,1fr)] sm:gap-7">
        <div className="relative h-[380px] overflow-hidden rounded-[20px] bg-photo-placeholder sm:h-[450px] sm:rounded-[18px]">
          {shot.state === "expired" ? (
            <div className="grid size-full place-items-center border border-dashed border-border-outline p-6 text-center text-sm text-text-muted">
              Foto sudah dihapus (disimpan 90 hari)
            </div>
          ) : status === "failed" ? (
            <div className="flex size-full flex-col items-center justify-center gap-3 border border-dashed border-danger/45 bg-danger/5 p-6 text-center">
              <span className="text-[15px] font-medium text-danger-text">Foto tidak dapat dibuka, coba lagi</span>
              <Button variant="secondary" onClick={() => setAttempt((n) => n + 1)}>
                Coba lagi
              </Button>
            </div>
          ) : (
            <img
              key={`${shot.src}-${attempt}`}
              src={attempt > 0 ? `${shot.src}?r=${attempt}` : shot.src}
              alt={`Selfie absen ${SELFIE_EVENT_LABELS[shot.event].toLowerCase()}`}
              onLoad={() => setStatus("ready")}
              onError={() => setStatus("failed")}
              className={`size-full object-cover ${status === "ready" ? "" : "animate-exa-pulse opacity-0"}`}
            />
          )}
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          {shots.length > 1 ? (
            <div className="sm:self-start">
              <SegmentedControl
                label="Foto absen"
                options={shots.map((s) => ({ value: s.event, label: SELFIE_EVENT_LABELS[s.event] }))}
                value={event}
                onChange={setEvent}
                fullWidth
              />
            </div>
          ) : null}
          <span className="text-[15px] font-medium text-text-primary tabular-nums sm:text-base">{when}</span>
          {flag !== null && isAttendanceFlag(flag.status) ? (
            <AttendanceFlag flag={{ kind: flag.status, distanceM: flag.distanceM, locationName: flag.locationName, accuracyM: flag.accuracyM }} workDate={workDate} />
          ) : null}
          <div className="hidden flex-1 sm:block" />
          <p className="text-caption text-pretty text-text-tertiary">Foto hanya bukti kehadiran. Disimpan 90 hari, lalu dihapus otomatis.</p>
        </div>
      </div>
    </Dialog>
  );
}

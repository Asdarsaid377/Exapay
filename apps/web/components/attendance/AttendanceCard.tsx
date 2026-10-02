"use client";

import { type AttendanceLocation, type AttendanceRecord, type AttendanceToday, timeZoneLabel } from "@exapay/shared";
import { CircleCheck, Clock, LogIn, LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { checkIn, checkOut } from "@/actions/attendance";
import { type AttendanceRowTone, AttendanceStatusRow } from "@/components/attendance/AttendanceStatusRow";
import { CheckInLocationNote } from "@/components/attendance/CheckInLocationNote";
import { Button } from "@/components/common/Button";
import { FormAlert } from "@/components/common/FormAlert";
import { attendanceStatusLabel, formatClockTime } from "@/lib/attendanceLabels";
import { formatLongDate } from "@/lib/datetime";
import { currentLocation } from "@/lib/geolocation";

type Props = {
  today: AttendanceToday;
};

type Step = "locating" | "saving";

const ACCESS_MESSAGES = {
  not_linked: "Akun Anda belum tertaut ke data karyawan, jadi belum bisa absen. Hubungi admin usaha.",
  inactive: "Data karyawan Anda tidak aktif hari ini, jadi belum bisa absen. Hubungi admin usaha.",
} as const;

// Kartu absen portal (snapshot context/designs/me.html — "Sebelum absen" / "Sesudah absen masuk"; keterangan lokasi
// me-attendance-location.html, feature 44). Kaca: salah satu dari 3 lapisan blur portal.
// GPS hanya diminta bila absen dicek ke lokasi kerja (today.locationCheck) — usaha tanpa lokasi / karyawan dikecualikan tidak dimintai izin.
// Jam tampil = jam server (selisih jam perangkat dikoreksi); jam yang tercatat tetap ditentukan API saat tombol ditekan.
export function AttendanceCard({ today }: Props) {
  const router = useRouter();
  const [offsetMs, setOffsetMs] = useState<number | null>(null);
  const [now, setNow] = useState(() => new Date(today.serverTime));
  const [step, setStep] = useState<Step | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Selisih jam perangkat dengan jam server dihitung ulang setiap data server baru (mis. setelah absen)
  useEffect(() => {
    setOffsetMs(Date.parse(today.serverTime) - Date.now());
  }, [today.serverTime]);

  useEffect(() => {
    if (offsetMs === null) return;
    const tick = (): void => setNow(new Date(Date.now() + offsetMs));
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [offsetMs]);

  // Lewat tengah malam lokal saat halaman terbuka → muat ulang data hari baru
  const localDate = todayIsoAt(now, today.timeZone);
  useEffect(() => {
    if (offsetMs !== null && localDate !== today.date) router.refresh();
  }, [localDate, offsetMs, today.date, router]);

  async function clock(kind: "in" | "out"): Promise<void> {
    setError(null);
    let location: AttendanceLocation | null = null;
    if (today.locationCheck) {
      setStep("locating");
      location = await currentLocation();
    }
    setStep("saving");
    const outcome = await (kind === "in" ? checkIn(location) : checkOut(location));
    setStep(null);
    if (outcome.kind === "error") {
      setError(outcome.message);
    }
  }

  const record = today.record;
  const busy = step !== null;
  const busyLabel = step === "locating" ? "Mengambil lokasi…" : "Menyimpan…";

  return (
    <section aria-labelledby="attendance-card-title" className="glass-strong flex flex-col gap-4 rounded-[24px] p-5">
      <h2 id="attendance-card-title" className="sr-only">
        Absen hari ini
      </h2>
      <div className="flex items-center justify-between gap-3 text-[13.5px] text-text-secondary">
        <span>Jam server · {timeZoneLabel(today.timeZone)}</span>
        <span className="truncate">{dayNote(today)}</span>
      </div>

      <div className="flex flex-col gap-1.5">
        <time
          dateTime={now.toISOString()}
          className="font-display text-[68px] leading-[0.95] font-extrabold tracking-[-0.04em] text-text-primary tabular-nums"
        >
          {formatClockTime(now, today.timeZone)}
        </time>
        <span className="text-[15px] font-bold text-text-primary">{formatLongDate(new Date(`${today.date}T12:00:00Z`), "UTC")}</span>
        <span className="text-sm text-text-secondary">
          {today.day.startTime && today.day.endTime ? `Jadwal ${today.day.startTime}–${today.day.endTime}` : "Tidak ada jadwal kerja hari ini"}
        </span>
      </div>

      {today.access !== "ok" ? (
        <FormAlert tone="info">{ACCESS_MESSAGES[today.access]}</FormAlert>
      ) : (
        <div className="flex flex-col gap-3">
          {record ? <AttendanceStatusRow icon={record.status === "late" ? Clock : CircleCheck} tone={statusTone(record)}>{checkInText(record, today.timeZone)}</AttendanceStatusRow> : null}
          {record?.checkOutAt ? (
            <AttendanceStatusRow icon={LogOut} tone="neutral">
              Pulang {formatClockTime(record.checkOutAt, today.timeZone)}
            </AttendanceStatusRow>
          ) : null}
          {/* Keterangan absen terakhir — tetap tampil sampai absen berikutnya */}
          {record ? (
            record.checkOutAt ? (
              <CheckInLocationNote event="check_out" geofence={record.checkOutGeofence} />
            ) : (
              <CheckInLocationNote event="check_in" geofence={record.checkInGeofence} />
            )
          ) : null}

          {error ? <FormAlert tone="danger">{error}</FormAlert> : null}

          {!record ? (
            <>
              <Button size="lg" fullWidth loading={busy} onClick={() => void clock("in")}>
                {busy ? null : <LogIn aria-hidden className="size-5" />}
                {busy ? busyLabel : "Absen Masuk"}
              </Button>
              {today.locationCheck ? (
                <p className="text-center text-[13px] text-pretty text-text-secondary">
                  Saat absen, Exapay membaca lokasi Anda untuk mencatat apakah Anda di area kerja.
                </p>
              ) : null}
            </>
          ) : !record.checkOutAt ? (
            <Button variant="dark" size="lg" fullWidth loading={busy} onClick={() => void clock("out")}>
              {busy ? null : <LogOut aria-hidden className="size-5" />}
              {busy ? busyLabel : "Absen Pulang"}
            </Button>
          ) : (
            <p className="text-center text-small text-text-secondary">Absen hari ini selesai. Terima kasih!</p>
          )}
        </div>
      )}

    </section>
  );
}

function statusTone(record: AttendanceRecord): AttendanceRowTone {
  if (record.status === "late") return "warning";
  return record.status === "on_time" ? "success" : "neutral";
}

// "Masuk 07:52 · Tepat waktu"
function checkInText(record: AttendanceRecord, timeZone: string): string {
  return `Masuk ${formatClockTime(record.checkInAt, timeZone)} · ${attendanceStatusLabel(record)}`;
}

// Keterangan kanan atas: nama libur / hari libur jadwal
function dayNote(today: AttendanceToday): string {
  if (today.day.holidayName) return today.day.holidayName;
  return today.day.isWorkday ? "Hari kerja" : "Hari libur";
}

function todayIsoAt(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone }).format(date);
}

"use client";

import { type AttendanceEvent, type AttendanceLocation, type AttendanceRecord, type AttendanceToday, timeZoneLabel } from "@exapay/shared";
import { CircleCheck, Clock, LogIn, LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { checkIn, checkOut } from "@/actions/attendance";
import { type AttendanceRowTone, AttendanceStatusRow } from "@/components/attendance/AttendanceStatusRow";
import { CheckInLocationNote } from "@/components/attendance/CheckInLocationNote";
import { Button } from "@/components/common/Button";
import { FormAlert } from "@/components/common/FormAlert";
import { SelfieCamera, type SelfieSubmitResult } from "@/components/selfie/SelfieCamera";
import { SelfieConsentSheet } from "@/components/selfie/SelfieConsentSheet";
import { SelfieThumb } from "@/components/selfie/SelfieThumb";
import { type SelfieShot, SelfieViewer } from "@/components/selfie/SelfieViewer";
import { attendanceStatusLabel, formatClockTime } from "@/lib/attendanceLabels";
import { formatLongDate } from "@/lib/datetime";
import { currentLocation } from "@/lib/geolocation";
import { SELFIE_CONSENT_STORAGE_KEY, selfieSrc } from "@/lib/selfies";

type Props = {
  today: AttendanceToday;
};

type Step = "locating" | "saving";
type Kind = "in" | "out";

const NETWORK_ERROR = "Absen belum terkirim — periksa sinyal internet. Foto tetap tersimpan di HP.";

const ACCESS_MESSAGES = {
  not_linked: "Akun Anda belum tertaut ke data karyawan, jadi belum bisa absen. Hubungi admin usaha.",
  inactive: "Data karyawan Anda tidak aktif hari ini, jadi belum bisa absen. Hubungi admin usaha.",
} as const;

// Kartu absen portal (snapshot context/designs/me.html — "Sebelum absen" / "Sesudah absen masuk"; keterangan lokasi
// me-attendance-location.html, feature 44). Kaca: salah satu dari 3 lapisan blur portal.
// GPS hanya diminta bila absen dicek ke lokasi kerja (today.locationCheck) — usaha tanpa lokasi / karyawan dikecualikan tidak dimintai izin.
// Jam tampil = jam server (selisih jam perangkat dikoreksi); jam yang tercatat tetap ditentukan API saat tombol ditekan.
// Wajib selfie (feature 45, design me-attendance-selfie): pemberitahuan sekali per perangkat → kamera depan → kirim
// absen + foto. Lokasi dibaca bersamaan saat kamera terbuka. Foto di kartu dibuka lewat SelfieViewer.
export function AttendanceCard({ today }: Props) {
  const router = useRouter();
  const [offsetMs, setOffsetMs] = useState<number | null>(null);
  const [now, setNow] = useState(() => new Date(today.serverTime));
  const [step, setStep] = useState<Step | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [consentFor, setConsentFor] = useState<Kind | null>(null);
  const [cameraFor, setCameraFor] = useState<Kind | null>(null);
  const [viewing, setViewing] = useState<AttendanceEvent | null>(null);
  const locationRef = useRef<Promise<AttendanceLocation | null> | null>(null);

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

  async function clock(kind: Kind): Promise<void> {
    setError(null);
    if (today.selfieRequired) {
      if (consentGiven()) openCamera(kind);
      else setConsentFor(kind);
      return;
    }
    let location: AttendanceLocation | null = null;
    if (today.locationCheck) {
      setStep("locating");
      location = await currentLocation();
    }
    setStep("saving");
    try {
      const outcome = await send(kind, location, null);
      if (outcome.kind === "error") setError(outcome.message);
    } catch {
      setError("Tidak dapat terhubung ke server. Periksa koneksi Anda lalu coba lagi.");
    } finally {
      setStep(null);
    }
  }

  function openCamera(kind: Kind): void {
    // Lokasi dibaca bersamaan dengan kamera agar kirim tetap cepat
    locationRef.current = today.locationCheck ? currentLocation() : Promise.resolve(null);
    setCameraFor(kind);
  }

  async function submitSelfie(kind: Kind, photo: Blob): Promise<SelfieSubmitResult> {
    try {
      const location = (await locationRef.current) ?? null;
      const outcome = await send(kind, location, photo);
      if (outcome.kind === "error") return { ok: false, message: outcome.message };
      setCameraFor(null);
      return { ok: true };
    } catch {
      return { ok: false, message: NETWORK_ERROR };
    }
  }

  const record = today.record;
  const busy = step !== null;
  const shots = record ? selfieShots(record) : [];
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
          {record && shots.length > 0 ? (
            <div className="flex flex-col gap-3">
              <SelfieShotRow
                record={record}
                event="check_in"
                time={`Masuk ${formatClockTime(record.checkInAt, today.timeZone)}`}
                status={attendanceStatusLabel(record)}
                tone={statusTone(record)}
                onOpen={() => setViewing("check_in")}
              />
              {record.checkOutAt ? (
                <SelfieShotRow
                  record={record}
                  event="check_out"
                  time={`Pulang ${formatClockTime(record.checkOutAt, today.timeZone)}`}
                  status={checkOutStatus(record, today.timeZone)}
                  tone="neutral"
                  onOpen={() => setViewing("check_out")}
                />
              ) : null}
            </div>
          ) : (
            <>
              {record ? <AttendanceStatusRow icon={record.status === "late" ? Clock : CircleCheck} tone={statusTone(record)}>{checkInText(record, today.timeZone)}</AttendanceStatusRow> : null}
              {record?.checkOutAt ? (
                <AttendanceStatusRow icon={LogOut} tone="neutral">
                  Pulang {formatClockTime(record.checkOutAt, today.timeZone)}
                </AttendanceStatusRow>
              ) : null}
            </>
          )}
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
              {today.selfieRequired ? (
                <p className="text-center text-[13px] text-pretty text-text-secondary">
                  Absen memakai selfie sebagai bukti kehadiran.{today.locationCheck ? " Lokasi Anda juga dicatat saat absen." : ""}
                </p>
              ) : today.locationCheck ? (
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

      <SelfieConsentSheet
        open={consentFor !== null}
        onLater={() => setConsentFor(null)}
        onAccept={() => {
          rememberConsent();
          const kind = consentFor;
          setConsentFor(null);
          if (kind) openCamera(kind);
        }}
      />
      {cameraFor ? (
        <SelfieCamera
          eventLabel={cameraFor === "in" ? "masuk" : "pulang"}
          clock={formatClockTime(now, today.timeZone)}
          zoneLabel={timeZoneLabel(today.timeZone)}
          onClose={() => setCameraFor(null)}
          onSubmit={(photo) => submitSelfie(cameraFor, photo)}
        />
      ) : null}
      {record && shots.length > 0 ? (
        <SelfieViewer
          open={viewing !== null}
          onClose={() => setViewing(null)}
          title={`Selfie absen ${viewing === "check_out" ? "pulang" : "masuk"}`}
          workDate={record.workDate}
          timeZone={today.timeZone}
          shots={shots}
          initialEvent={viewing ?? "check_in"}
        />
      ) : null}
    </section>
  );
}

function send(kind: Kind, location: AttendanceLocation | null, photo: Blob | null) {
  const body = new FormData();
  body.set("location", location ? JSON.stringify(location) : "");
  if (photo) body.set("selfie", photo, "selfie.jpg");
  return kind === "in" ? checkIn(body) : checkOut(body);
}

function consentGiven(): boolean {
  try {
    return window.localStorage.getItem(SELFIE_CONSENT_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function rememberConsent(): void {
  try {
    window.localStorage.setItem(SELFIE_CONSENT_STORAGE_KEY, "1");
  } catch {
    // Penyimpanan diblokir — pemberitahuan tampil lagi lain kali
  }
}

function selfieShots(record: AttendanceRecord): SelfieShot[] {
  const shots: SelfieShot[] = [];
  if (record.checkInSelfie) {
    shots.push({ event: "check_in", state: record.checkInSelfie, src: selfieSrc("portal", record.id, "check_in"), at: record.checkInAt, geofence: record.checkInGeofence });
  }
  if (record.checkOutSelfie && record.checkOutAt) {
    shots.push({ event: "check_out", state: record.checkOutSelfie, src: selfieSrc("portal", record.id, "check_out"), at: record.checkOutAt, geofence: record.checkOutGeofence });
  }
  return shots;
}

const SHOT_STATUS_TEXT: Record<AttendanceRowTone, string> = {
  success: "text-success-text",
  warning: "text-warning-text",
  neutral: "text-text-secondary",
};

// Baris jam + thumbnail selfie bulat 44px (design me-attendance-selfie state 9–10)
function SelfieShotRow(props: { record: AttendanceRecord; event: AttendanceEvent; time: string; status: string; tone: AttendanceRowTone; onOpen: () => void }) {
  const { record, event, time, status, tone, onOpen } = props;
  const state = event === "check_in" ? record.checkInSelfie : record.checkOutSelfie;
  return (
    <div className="flex items-center gap-3">
      {state ? (
        <SelfieThumb state={state} src={selfieSrc("portal", record.id, event)} label={`Lihat selfie absen ${event === "check_in" ? "masuk" : "pulang"}`} onOpen={onOpen} size="lg" />
      ) : (
        <span aria-hidden className="size-11 shrink-0" />
      )}
      <div className="flex min-w-0 flex-col gap-px">
        <span className="font-display text-base font-bold text-text-primary tabular-nums">{time}</span>
        <span className={`text-[13px] font-medium ${SHOT_STATUS_TEXT[tone]}`}>{status}</span>
      </div>
    </div>
  );
}

// Pulang sebelum jam selesai jadwal → "Sebelum jadwal selesai"; selain itu "Sesuai jadwal"
function checkOutStatus(record: AttendanceRecord, timeZone: string): string {
  if (!record.checkOutAt || !record.scheduledEnd) return "Absen pulang";
  return formatClockTime(record.checkOutAt, timeZone) < record.scheduledEnd ? "Sebelum jadwal selesai" : "Sesuai jadwal";
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

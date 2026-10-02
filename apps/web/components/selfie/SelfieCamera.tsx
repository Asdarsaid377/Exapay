"use client";

import { CameraOff, CircleAlert, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { compressSelfie } from "@/lib/selfies";

export type SelfieSubmitResult = { ok: true } | { ok: false; message: string };

type Props = {
  // "masuk" | "pulang"
  eventLabel: string;
  // Jam server berjalan ("07:58") + label zona ("WITA")
  clock: string;
  zoneLabel: string;
  onClose: () => void;
  // Mengirim absen + foto; gagal → foto tetap di HP, tombol "Coba lagi"
  onSubmit: (photo: Blob) => Promise<SelfieSubmitResult>;
};

type Phase = "starting" | "live" | "denied" | "unavailable" | "review" | "sending" | "failed";

// Layar kamera selfie (design me-attendance-selfie "SelfieCameraScreen"): layar penuh gelap, kamera depan langsung di
// aplikasi (tanpa galeri), oval panduan statis, tombol rana, pratinjau → Ulangi / Kirim, gagal kirim → Coba lagi.
// Hanya bukti kehadiran — tanpa deteksi/pengenalan wajah. Dirender lewat portal ke <body>: kartu kaca (backdrop-filter)
// menjadi containing block untuk elemen `fixed`.
export function SelfieCamera({ eventLabel, clock, zoneLabel, onClose, onSubmit }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [phase, setPhase] = useState<Phase>("starting");
  const [photo, setPhoto] = useState<{ blob: Blob; url: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const startCamera = useCallback(async () => {
    setPhase("starting");
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setPhase("unavailable");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 1280 } }, audio: false });
      streamRef.current = stream;
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        await video.play().catch(() => undefined);
      }
      setPhase("live");
    } catch (cause: unknown) {
      const name = cause instanceof DOMException ? cause.name : "";
      setPhase(name === "NotAllowedError" || name === "SecurityError" ? "denied" : "unavailable");
    }
  }, []);

  useEffect(() => {
    setMounted(true);
    void startCamera();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      stopStream();
      document.body.style.overflow = previous;
    };
  }, [startCamera, stopStream]);

  useEffect(() => () => {
    if (photo) URL.revokeObjectURL(photo.url);
  }, [photo]);

  const sending = phase === "sending";

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !sending) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, sending]);

  async function capture() {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext("2d");
    if (!context) return;
    // Dicerminkan seperti pratinjau agar foto sama dengan yang dilihat karyawan
    context.translate(canvas.width, 0);
    context.scale(-1, 1);
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    try {
      const blob = await compressSelfie(canvas);
      setPhoto({ blob, url: URL.createObjectURL(blob) });
      stopStream();
      setPhase("review");
    } catch {
      setError("Foto gagal diproses. Coba ambil ulang.");
    }
  }

  function retake() {
    setPhoto(null);
    setError(null);
    void startCamera();
  }

  async function send() {
    if (!photo) return;
    setError(null);
    setPhase("sending");
    const result = await onSubmit(photo.blob);
    if (!result.ok) {
      setError(result.message);
      setPhase("failed");
    }
  }

  if (!mounted) return null;
  const blocked = phase === "denied" || phase === "unavailable";
  const reviewing = phase === "review" || phase === "sending" || phase === "failed";
  const title = `Selfie absen ${eventLabel}`;

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={title} className="fixed inset-0 z-50 flex flex-col gap-3.5 bg-camera-bg px-4 pt-3.5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] text-on-camera">
      <div className="mx-auto grid w-full max-w-lg grid-cols-[44px_1fr_44px] items-center">
        <button
          type="button"
          aria-label="Tutup kamera"
          onClick={onClose}
          disabled={sending}
          className="grid size-11 place-items-center rounded-full bg-on-camera/12 transition-colors hover:bg-on-camera/20 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-accent/60 disabled:opacity-40"
        >
          <X aria-hidden className="size-5" />
        </button>
        <span className="text-center font-display text-[15px] font-bold">{title}</span>
        <span />
      </div>

      <div className="flex flex-col items-center gap-0.5">
        <span className="font-display text-[44px] leading-none font-extrabold tracking-[-0.03em] tabular-nums">{clock}</span>
        <span className="text-[13px] text-on-camera-muted">{zoneLabel} · jam server</span>
      </div>

      <div className={`relative mx-auto flex min-h-0 w-full max-w-lg flex-1 items-center justify-center overflow-hidden rounded-[28px] ${reviewing ? "bg-photo-placeholder" : "bg-camera-preview"}`}>
        <video
          ref={videoRef}
          playsInline
          muted
          aria-hidden
          className={`absolute inset-0 size-full -scale-x-100 object-cover ${phase === "live" ? "" : "hidden"}`}
        />
        {reviewing && photo ? <img src={photo.url} alt="Pratinjau selfie" className="absolute inset-0 size-full object-cover" /> : null}
        {phase === "live" ? <div aria-hidden className="relative h-[290px] w-[220px] rounded-[50%] border-2 border-camera-guide" /> : null}
        {phase === "starting" ? <span className="text-sm text-on-camera-muted">Membuka kamera…</span> : null}
        {blocked ? (
          <div className="flex max-w-[280px] flex-col items-center gap-2.5 text-center">
            <CameraOff aria-hidden className="size-7.5 text-on-camera-muted" />
            <span className="font-display text-lg font-bold">{phase === "denied" ? "Kamera diblokir" : "Kamera depan tidak tersedia"}</span>
            <span className="text-[14.5px] text-pretty text-on-camera-muted">
              {phase === "denied"
                ? "Izinkan akses kamera untuk Exapay di pengaturan browser, lalu coba lagi."
                : "Perangkat ini tidak punya kamera depan yang bisa dipakai. Coba dari HP lain."}
            </span>
            <button
              type="button"
              onClick={() => void startCamera()}
              className="mt-2 h-12 rounded-full bg-accent px-6 font-display text-[15px] font-bold text-on-accent transition-colors hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-on-camera/60"
            >
              Coba lagi
            </button>
            <span className="text-[13.5px] text-on-camera-muted">Tidak bisa? Hubungi admin usaha Anda.</span>
          </div>
        ) : null}
      </div>

      <div className="mx-auto flex w-full max-w-lg flex-col gap-3">
        {phase === "live" ? (
          <div className="flex flex-col items-center gap-4">
            <span className="text-[15px] text-on-camera-muted">Pastikan wajah terlihat jelas</span>
            {error ? <span className="text-sm text-on-camera">{error}</span> : null}
            <button
              type="button"
              aria-label="Ambil foto"
              onClick={() => void capture()}
              className="size-[78px] rounded-full border-4 border-on-camera p-1.25 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-accent/60"
            >
              <span className="block size-full rounded-full bg-on-camera" />
            </button>
          </div>
        ) : null}
        {phase === "failed" ? (
          <div role="alert" className="flex gap-2.5 rounded-[14px] border border-danger/40 bg-surface-solid px-3.5 py-3 text-text-primary">
            <CircleAlert aria-hidden className="mt-px size-4.5 shrink-0 text-danger" />
            <span className="text-sm font-medium text-pretty">{error ?? "Absen belum terkirim — periksa sinyal internet. Foto tetap tersimpan di HP."}</span>
          </div>
        ) : null}
        {reviewing ? (
          <>
            {phase === "review" ? <span className="text-center text-[13px] text-on-camera-muted">Jam absen dicatat saat dikirim.</span> : null}
            <div className="grid grid-cols-[0.8fr_1.2fr] gap-2.5">
              <button
                type="button"
                onClick={retake}
                disabled={sending}
                className="h-13 rounded-full border border-on-camera/35 font-display text-[15px] font-bold transition-colors hover:bg-on-camera/10 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-accent/60 disabled:opacity-40"
              >
                {phase === "failed" ? "Ulangi foto" : "Ulangi"}
              </button>
              <button
                type="button"
                onClick={() => void send()}
                disabled={sending}
                className="flex h-13 items-center justify-center gap-2 rounded-full bg-accent font-display text-[15px] font-bold text-on-accent transition-colors hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-on-camera/60 disabled:opacity-80"
              >
                {sending ? <span aria-hidden className="size-4 animate-spin rounded-full border-[2.5px] border-on-accent/25 border-t-on-accent" /> : null}
                {sending ? "Mengirim…" : phase === "failed" ? "Coba lagi" : `Kirim absen ${eventLabel}`}
              </button>
            </div>
          </>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}

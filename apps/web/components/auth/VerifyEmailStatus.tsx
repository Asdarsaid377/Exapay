"use client";

import { CircleCheck, LinkIcon } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { verifyEmail } from "@/actions/auth";
import { AuthHeading } from "@/components/auth/AuthHeading";
import { Button, buttonClassName } from "@/components/common/Button";
import { FormAlert } from "@/components/common/FormAlert";

type Props = {
  // null jika URL tidak membawa token
  token: string | null;
};

type Status = { kind: "verifying" } | { kind: "success" } | { kind: "invalid-token" } | { kind: "error"; message: string };

// Verifikasi dijalankan otomatis saat halaman dibuka dari tautan email.
export function VerifyEmailStatus({ token }: Props) {
  const [status, setStatus] = useState<Status>(token ? { kind: "verifying" } : { kind: "invalid-token" });
  // Cegah panggilan ganda (StrictMode dev) — API idempoten, tapi tidak perlu dua request
  const started = useRef(false);

  const run = useCallback(async (value: string) => {
    setStatus({ kind: "verifying" });
    try {
      const outcome = await verifyEmail(value);
      setStatus(outcome.kind === "error" ? { kind: "error", message: outcome.message } : { kind: outcome.kind });
    } catch {
      setStatus({ kind: "error", message: "Tidak dapat terhubung ke server. Periksa koneksi Anda lalu coba lagi." });
    }
  }, []);

  useEffect(() => {
    if (!token || started.current) return;
    started.current = true;
    void run(token);
  }, [token, run]);

  if (status.kind === "verifying") {
    return (
      <div className="flex flex-col gap-4" aria-busy>
        <AuthHeading title="Memverifikasi email…" description="Mohon tunggu sebentar." />
        <div className="h-12 w-full animate-exa-pulse rounded-full bg-fill" />
      </div>
    );
  }

  if (status.kind === "success") {
    return (
      <>
        <div className="flex flex-col gap-4">
          <div className="flex size-11 items-center justify-center rounded-field bg-success-soft text-success">
            <CircleCheck aria-hidden className="size-5" />
          </div>
          <AuthHeading title="Email berhasil diverifikasi" description="Akun Anda sudah aktif. Silakan masuk untuk mulai mengelola usaha Anda." />
        </div>
        <Link href="/login" className={buttonClassName({ size: "lg", fullWidth: true })}>
          Masuk sekarang
        </Link>
      </>
    );
  }

  if (status.kind === "invalid-token") {
    return (
      <>
        <div className="flex flex-col gap-4">
          <div className="flex size-11 items-center justify-center rounded-field bg-warning-soft text-warning-icon">
            <LinkIcon aria-hidden className="size-5" />
          </div>
          <AuthHeading
            title="Tautan tidak valid"
            description="Tautan verifikasi sudah kedaluwarsa atau tidak lengkap. Masuk dengan email dan password Anda untuk meminta tautan baru."
          />
        </div>
        <Link href="/login" className={buttonClassName({ size: "lg", fullWidth: true })}>
          Masuk untuk kirim ulang
        </Link>
      </>
    );
  }

  return (
    <>
      <AuthHeading title="Verifikasi gagal" />
      <FormAlert tone="danger">{status.message}</FormAlert>
      {token ? (
        <Button size="lg" fullWidth onClick={() => void run(token)}>
          Coba lagi
        </Button>
      ) : null}
    </>
  );
}

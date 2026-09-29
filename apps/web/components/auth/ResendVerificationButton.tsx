"use client";

import { useEffect, useState } from "react";

import { resendVerification } from "@/actions/auth";
import { Button } from "@/components/common/Button";
import { FormAlert } from "@/components/common/FormAlert";

type Props = {
  email: string;
  // Mulai dengan hitung mundur (mis. tepat setelah signup — email baru saja dikirim)
  startWithCooldown?: boolean;
};

// Sama dengan cooldown kirim ulang di API
const COOLDOWN_SECONDS = 60;

export function ResendVerificationButton({ email, startWithCooldown = false }: Props) {
  const [secondsLeft, setSecondsLeft] = useState(startWithCooldown ? COOLDOWN_SECONDS : 0);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ tone: "success" | "danger"; message: string } | null>(null);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const timer = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [secondsLeft]);

  async function handleResend() {
    setResult(null);
    setSending(true);
    try {
      const outcome = await resendVerification(email);
      if (outcome.kind === "success") {
        setResult({ tone: "success", message: "Email verifikasi baru telah dikirim. Periksa inbox atau folder spam Anda." });
        setSecondsLeft(COOLDOWN_SECONDS);
      } else {
        setResult({ tone: "danger", message: outcome.kind === "error" ? outcome.message : "Terjadi kesalahan. Silakan coba lagi." });
      }
    } catch {
      setResult({ tone: "danger", message: "Tidak dapat terhubung ke server. Periksa koneksi Anda lalu coba lagi." });
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {result ? <FormAlert tone={result.tone}>{result.message}</FormAlert> : null}
      <Button variant="secondary" fullWidth loading={sending} disabled={secondsLeft > 0} onClick={handleResend}>
        {sending ? "Mengirim…" : secondsLeft > 0 ? `Kirim ulang dalam ${secondsLeft} detik` : "Kirim ulang email verifikasi"}
      </Button>
    </div>
  );
}

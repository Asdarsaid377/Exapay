"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { resendPayslipEmail } from "@/actions/payslips";

type Props = {
  runId: string;
  payslipId: string;
};

// Kirim ulang email pemberitahuan satu slip terbit (feature 31) — tautan teks kecil di baris tabel
export function ResendPayslipEmailButton({ runId, payslipId }: Props) {
  const router = useRouter();
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    setError(null);
    setSending(true);
    try {
      const outcome = await resendPayslipEmail(runId, payslipId);
      if (outcome.kind === "error") setError(outcome.message);
      else router.refresh();
    } catch {
      setError("Tidak dapat terhubung ke server.");
    } finally {
      setSending(false);
    }
  }

  return (
    <span className="inline-flex flex-col items-start gap-0.5 lg:items-end">
      <button
        type="button"
        onClick={send}
        disabled={sending}
        className="-my-2 inline-flex min-h-11 items-center text-sm font-bold text-accent-strong hover:text-accent-hover hover:underline focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-accent/45 disabled:cursor-wait disabled:opacity-70"
      >
        {sending ? "Mengirim…" : "Kirim ulang email"}
      </button>
      {error ? <span className="text-caption text-danger-text">{error}</span> : null}
    </span>
  );
}

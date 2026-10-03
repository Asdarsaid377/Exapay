"use client";

import { Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { closeSetupGuide } from "@/actions/setupGuide";
import { Button } from "@/components/common/Button";

// Semua langkah selesai (design setup-guide layar 6): kartu ringkas sampai ditutup; setelah itu panduan tidak muncul lagi
export function SetupDoneCard() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClose() {
    setError(null);
    setSubmitting(true);
    try {
      const outcome = await closeSetupGuide();
      if (outcome.kind === "error") setError(outcome.message);
      else router.refresh();
    } catch {
      setError("Tidak dapat terhubung ke server. Coba lagi.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section aria-labelledby="setup-done-title" className="glass-strong flex flex-wrap items-center gap-4 rounded-card py-4.5 pr-5 pl-6">
      <span className="grid size-7 shrink-0 place-items-center rounded-full bg-success">
        <Check aria-hidden className="size-4.25 text-white" strokeWidth={3} />
      </span>
      <div className="flex min-w-0 flex-1 basis-60 flex-col gap-0.5">
        <h2 id="setup-done-title" className="font-display text-[17px] font-bold text-text-primary">
          Exapay siap dipakai
        </h2>
        <p className="text-sm text-pretty text-text-secondary">
          {error ?? "Payroll pertama Anda sudah dibuat. Panduan ini tidak akan muncul lagi."}
        </p>
      </div>
      <Button variant="secondary" onClick={() => void handleClose()} loading={submitting} className="h-10 px-5 text-sm max-sm:w-full">
        {submitting ? "Menutup…" : "Tutup"}
      </Button>
    </section>
  );
}

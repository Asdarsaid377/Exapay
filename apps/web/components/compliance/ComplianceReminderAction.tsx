"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { completeComplianceReminder, reopenComplianceReminder } from "@/actions/compliance";

type Props = {
  reminderKey: string;
  done: boolean;
};

// Tandai selesai / batalkan satu pengingat (feature 33) — tautan teks kecil di baris (pola ResendPayslipEmailButton)
export function ComplianceReminderAction({ reminderKey, done }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setError(null);
    setBusy(true);
    try {
      const outcome = done ? await reopenComplianceReminder(reminderKey) : await completeComplianceReminder(reminderKey);
      if (outcome.kind === "error") setError(outcome.message);
      else router.refresh();
    } catch {
      setError("Tidak dapat terhubung ke server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex flex-col items-end gap-0.5">
      <button
        type="button"
        onClick={run}
        disabled={busy}
        className={`-my-2 inline-flex min-h-11 items-center text-sm font-bold whitespace-nowrap focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-accent/45 disabled:cursor-wait disabled:opacity-70 ${
          done ? "text-text-secondary hover:text-text-primary hover:underline" : "text-accent-strong hover:text-accent-hover hover:underline"
        }`}
      >
        {busy ? "Menyimpan…" : done ? "Batalkan" : "Tandai selesai"}
      </button>
      {error ? <span className="max-w-48 text-right text-caption text-danger-text">{error}</span> : null}
    </span>
  );
}

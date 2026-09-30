"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { addBuiltinKpiTemplates } from "@/actions/kpiTemplates";
import { Button } from "@/components/common/Button";

type Props = {
  // secondary di banner; primary sebagai CTA empty state
  variant?: "primary" | "secondary";
  label: string;
};

// Tambahkan kembali template bawaan yang belum ada (Sales, Kasir, Admin Gudang, Staf Produksi)
export function AddBuiltinKpiTemplatesButton({ variant = "secondary", label }: Props) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setError(null);
    setSubmitting(true);
    try {
      const outcome = await addBuiltinKpiTemplates();
      if (outcome.kind === "error") {
        setError(outcome.message);
        return;
      }
      router.refresh();
    } catch {
      setError("Tidak dapat terhubung ke server. Coba lagi.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col items-center gap-1.5 sm:items-end">
      <Button variant={variant} onClick={handleClick} loading={submitting}>
        {submitting ? "Menambahkan…" : label}
      </Button>
      {error ? (
        <p role="alert" className="text-caption text-danger-text">
          {error}
        </p>
      ) : null}
    </div>
  );
}

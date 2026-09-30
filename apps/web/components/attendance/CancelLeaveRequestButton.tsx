"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { cancelLeaveRequest } from "@/actions/leaveRequests";
import { Button } from "@/components/common/Button";
import { Dialog } from "@/components/common/Dialog";
import { FormAlert } from "@/components/common/FormAlert";

type Props = {
  id: string;
  // Mis. "Izin · 6–8 Okt 2026"
  summary: string;
};

// Batalkan pengajuan milik sendiri yang masih menunggu (konfirmasi dulu)
export function CancelLeaveRequestButton({ id, summary }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function close() {
    setError(null);
    setOpen(false);
  }

  async function confirm() {
    setError(null);
    setSubmitting(true);
    try {
      const outcome = await cancelLeaveRequest(id);
      if (outcome.kind === "error") {
        setError(outcome.message);
        return;
      }
      setOpen(false);
      router.refresh();
    } catch {
      setError("Tidak dapat terhubung ke server. Periksa koneksi Anda lalu coba lagi.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="-my-2 inline-flex min-h-11 items-center text-sm font-bold text-danger-text hover:underline focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-accent/45"
      >
        Batalkan
      </button>
      <Dialog
        open={open}
        onClose={close}
        dismissible={!submitting}
        title="Batalkan pengajuan?"
        description={`${summary}. Pengajuan yang dibatalkan tidak bisa dipulihkan — ajukan ulang jika masih diperlukan.`}
        footer={
          <>
            <Button variant="secondary" onClick={close} disabled={submitting}>
              Kembali
            </Button>
            <Button variant="dark" onClick={confirm} loading={submitting}>
              {submitting ? "Membatalkan…" : "Batalkan pengajuan"}
            </Button>
          </>
        }
      >
        {error ? <FormAlert tone="danger">{error}</FormAlert> : null}
      </Dialog>
    </>
  );
}

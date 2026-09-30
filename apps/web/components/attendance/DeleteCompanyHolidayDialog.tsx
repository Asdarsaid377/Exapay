"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { deleteCompanyHoliday } from "@/actions/workCalendar";
import { Button } from "@/components/common/Button";
import { Dialog } from "@/components/common/Dialog";
import { FormAlert } from "@/components/common/FormAlert";
import { formatIsoDate } from "@/lib/datetime";

type Props = {
  open: boolean;
  onClose: () => void;
  holiday: { id: string; date: string; name: string };
};

// Konfirmasi hapus libur usaha (pola DeleteOrgItemDialog)
export function DeleteCompanyHolidayDialog({ open, onClose, holiday }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function close() {
    setError(null);
    onClose();
  }

  async function handleConfirm() {
    setError(null);
    setSubmitting(true);
    try {
      const outcome = await deleteCompanyHoliday(holiday.id);
      if (outcome.kind === "error") {
        setError(outcome.message);
        return;
      }
      onClose();
      router.refresh();
    } catch {
      setError("Tidak dapat terhubung ke server. Periksa koneksi Anda lalu coba lagi.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      dismissible={!submitting}
      title={`Hapus ${holiday.name}?`}
      description={`${formatIsoDate(holiday.date)} kembali menjadi hari kerja biasa sesuai jadwal.`}
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={submitting}>
            Batal
          </Button>
          <Button variant="dark" onClick={handleConfirm} loading={submitting}>
            {submitting ? "Menghapus…" : "Hapus"}
          </Button>
        </>
      }
    >
      {error ? <FormAlert tone="danger">{error}</FormAlert> : null}
    </Dialog>
  );
}

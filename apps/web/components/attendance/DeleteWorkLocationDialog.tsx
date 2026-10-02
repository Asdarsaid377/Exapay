"use client";

import type { WorkLocation } from "@exapay/shared";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { deleteWorkLocation } from "@/actions/workLocations";
import { Button } from "@/components/common/Button";
import { Dialog } from "@/components/common/Dialog";
import { FormAlert } from "@/components/common/FormAlert";

type Props = {
  open: boolean;
  onClose: () => void;
  location: WorkLocation;
};

// Konfirmasi hapus lokasi kerja (design settings-locations "Dialog Hapus"). Absen lama tidak berubah (snapshot);
// karyawan "lokasi tertentu" yang kehilangan semua lokasinya kembali ke semua lokasi (API).
export function DeleteWorkLocationDialog({ open, onClose, location }: Props) {
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
      const outcome = await deleteWorkLocation(location.id);
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
      title={`Hapus lokasi ${location.name}?`}
      description={
        location.selectedEmployeeCount > 0
          ? `Absen yang sudah tercatat tidak berubah. ${location.selectedEmployeeCount} karyawan memilih lokasi ini — yang tidak punya lokasi lain akan dicek di semua lokasi.`
          : "Absen yang sudah tercatat tidak berubah."
      }
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={submitting}>
            Batal
          </Button>
          <Button variant="danger" onClick={handleConfirm} loading={submitting}>
            {submitting ? "Menghapus…" : "Hapus"}
          </Button>
        </>
      }
    >
      {error ? <FormAlert tone="danger">{error}</FormAlert> : null}
    </Dialog>
  );
}

"use client";

import type { WorkShift } from "@exapay/shared";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { deleteWorkShift } from "@/actions/shiftRoster";
import { Button } from "@/components/common/Button";
import { Dialog } from "@/components/common/Dialog";
import { FormAlert } from "@/components/common/FormAlert";

type Props = {
  open: boolean;
  onClose: () => void;
  shift: WorkShift;
};

// Konfirmasi hapus shift (design settings-attendance-shifts "Dialog Hapus"). Roster hari ini & ke depan yang belum terkunci
// dikosongkan; yang terkunci (sudah absen / periode final) tetap menyimpan jadwal lama (API).
export function DeleteWorkShiftDialog({ open, onClose, shift }: Props) {
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
      const outcome = await deleteWorkShift(shift.id);
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
      title={`Hapus shift ${shift.name}?`}
      description={
        shift.upcomingAssignments > 0
          ? `Shift ini terjadwal untuk ${shift.upcomingAssignments} hari ke depan. Jadwal itu akan kosong dan perlu diisi ulang.`
          : "Shift ini belum terjadwal."
      }
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={submitting}>
            Batal
          </Button>
          <Button variant="danger" onClick={handleConfirm} loading={submitting}>
            {submitting ? "Menghapus…" : "Hapus shift"}
          </Button>
        </>
      }
    >
      {error ? <FormAlert tone="danger">{error}</FormAlert> : null}
    </Dialog>
  );
}

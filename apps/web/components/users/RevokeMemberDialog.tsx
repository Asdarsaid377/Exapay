"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { revokeMember } from "@/actions/users";
import { Button } from "@/components/common/Button";
import { Dialog } from "@/components/common/Dialog";
import { FormAlert } from "@/components/common/FormAlert";

type Props = {
  open: boolean;
  onClose: () => void;
  membershipId: string;
  fullName: string;
  tenantName: string;
};

// Konfirmasi cabut akses: membership dihapus, akun pengguna tetap ada (bisa diundang lagi)
export function RevokeMemberDialog({ open, onClose, membershipId, fullName, tenantName }: Props) {
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
      const outcome = await revokeMember(membershipId);
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
      title={`Cabut akses ${fullName}?`}
      description={`${fullName} tidak bisa lagi masuk ke ${tenantName}. Sesi yang sedang terbuka berakhir paling lambat 15 menit. Akun Exapay-nya tidak dihapus dan bisa diundang kembali.`}
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={submitting}>
            Batal
          </Button>
          <Button variant="dark" onClick={handleConfirm} loading={submitting}>
            {submitting ? "Mencabut…" : "Cabut akses"}
          </Button>
        </>
      }
    >
      {error ? <FormAlert tone="danger">{error}</FormAlert> : null}
    </Dialog>
  );
}

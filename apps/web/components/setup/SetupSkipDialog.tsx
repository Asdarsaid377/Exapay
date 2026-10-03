"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { setSetupGuideHidden } from "@/actions/setupGuide";
import { Button } from "@/components/common/Button";
import { Dialog } from "@/components/common/Dialog";
import { FormAlert } from "@/components/common/FormAlert";

type Props = {
  open: boolean;
  onClose: () => void;
  tenantName: string;
};

// Konfirmasi "Lewati panduan" (design setup-guide layar 4): disembunyikan untuk seluruh usaha, bisa dibuka lagi dari menu akun
export function SetupSkipDialog({ open, onClose, tenantName }: Props) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function close() {
    setError(null);
    onClose();
  }

  async function handleHide() {
    setError(null);
    setSubmitting(true);
    try {
      const outcome = await setSetupGuideHidden(true);
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
      title="Sembunyikan panduan?"
      description={`Anda bisa membukanya lagi dari menu akun › Panduan setup. Panduan disembunyikan untuk semua pemilik dan admin ${tenantName}.`}
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={submitting}>
            Batal
          </Button>
          <Button onClick={() => void handleHide()} loading={submitting}>
            {submitting ? "Menyimpan…" : "Sembunyikan"}
          </Button>
        </>
      }
    >
      {error ? <FormAlert tone="danger">{error}</FormAlert> : null}
    </Dialog>
  );
}

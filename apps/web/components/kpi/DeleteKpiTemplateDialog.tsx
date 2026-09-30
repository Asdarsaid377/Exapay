"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { deleteKpiTemplate } from "@/actions/kpiTemplates";
import { Button } from "@/components/common/Button";
import { Dialog } from "@/components/common/Dialog";
import { FormAlert } from "@/components/common/FormAlert";

type Props = {
  open: boolean;
  onClose: () => void;
  template: { id: string; name: string; positionCount: number };
};

// Konfirmasi hapus template KPI — jabatan yang memakainya menjadi tanpa template
export function DeleteKpiTemplateDialog({ open, onClose, template }: Props) {
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
      const outcome = await deleteKpiTemplate(template.id);
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

  const description =
    template.positionCount > 0
      ? `Template dan indikatornya dihapus. ${template.positionCount} jabatan yang memakainya menjadi tanpa template KPI sampai Anda memasang template lain.`
      : "Template dan indikatornya dihapus dari daftar.";

  return (
    <Dialog
      open={open}
      onClose={close}
      dismissible={!submitting}
      title={`Hapus template ${template.name}?`}
      description={description}
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

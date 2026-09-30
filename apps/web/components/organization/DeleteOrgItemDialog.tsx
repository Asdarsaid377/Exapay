"use client";

import type { OrgKind } from "@exapay/shared";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { deleteOrgItem } from "@/actions/organization";
import { Button } from "@/components/common/Button";
import { Dialog } from "@/components/common/Dialog";
import { FormAlert } from "@/components/common/FormAlert";
import { ORG_LABELS } from "@/lib/organizationLabels";

type Props = {
  open: boolean;
  onClose: () => void;
  kind: OrgKind;
  item: { id: string; name: string };
};

// Konfirmasi hapus departemen / jabatan
export function DeleteOrgItemDialog({ open, onClose, kind, item }: Props) {
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
      const outcome = await deleteOrgItem(kind, item.id);
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
      title={`Hapus ${item.name}?`}
      description={`${ORG_LABELS[kind].title} ini dihapus dari daftar. Anda bisa menambahkannya kembali kapan saja.`}
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

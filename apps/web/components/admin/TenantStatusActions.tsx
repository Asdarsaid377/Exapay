"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { deactivateTenant, reactivateTenant } from "@/actions/adminTenants";
import { Button } from "@/components/common/Button";
import { Dialog } from "@/components/common/Dialog";
import { FormAlert } from "@/components/common/FormAlert";

type Props = {
  tenantId: string;
  tenantName: string;
  deactivated: boolean;
};

// Nonaktifkan / aktifkan kembali tenant, selalu lewat dialog konfirmasi
export function TenantStatusActions({ tenantId, tenantName, deactivated }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function close() {
    setOpen(false);
    setError(null);
  }

  async function handleConfirm() {
    setError(null);
    setSubmitting(true);
    try {
      const outcome = deactivated ? await reactivateTenant(tenantId) : await deactivateTenant(tenantId);
      if (outcome.kind === "error") {
        setError(outcome.message);
        return;
      }
      close();
      router.refresh();
    } catch {
      setError("Tidak dapat terhubung ke server. Periksa koneksi Anda lalu coba lagi.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Button variant={deactivated ? "primary" : "secondary"} onClick={() => setOpen(true)}>
        {deactivated ? "Aktifkan kembali" : "Nonaktifkan tenant"}
      </Button>
      <Dialog
        open={open}
        onClose={close}
        dismissible={!submitting}
        title={deactivated ? `Aktifkan kembali ${tenantName}?` : `Nonaktifkan ${tenantName}?`}
        description={
          deactivated
            ? "Semua pengguna usaha ini bisa masuk kembali seperti sebelumnya."
            : "Semua pengguna usaha ini tidak bisa masuk sampai tenant diaktifkan kembali. Data usaha tidak dihapus. Sesi yang sedang terbuka berakhir paling lambat 15 menit."
        }
        footer={
          <>
            <Button variant="secondary" onClick={close} disabled={submitting}>
              Batal
            </Button>
            <Button variant={deactivated ? "primary" : "dark"} onClick={handleConfirm} loading={submitting}>
              {submitting ? "Menyimpan…" : deactivated ? "Aktifkan kembali" : "Nonaktifkan"}
            </Button>
          </>
        }
      >
        {error ? <FormAlert tone="danger">{error}</FormAlert> : null}
      </Dialog>
    </>
  );
}

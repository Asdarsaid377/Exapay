"use client";

import { formatRupiah } from "@exapay/shared";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { confirmPayment, rejectPayment } from "@/actions/adminBilling";
import { Button } from "@/components/common/Button";
import { Dialog } from "@/components/common/Dialog";
import { FormAlert } from "@/components/common/FormAlert";
import { TextAreaField } from "@/components/common/TextAreaField";

type Props = {
  tenantId: string;
  invoiceId: string;
  tenantName: string;
  invoiceNumber: string;
  totalAmount: string;
};

type Mode = "confirm" | "reject" | null;

// Konfirmasi lunas / tolak satu laporan bayar di /admin/billing (feature 42). Keduanya lewat dialog: konfirmasi
// menegaskan nominal persis yang harus ada di mutasi; tolak wajib alasan (dikirim ke owner).
// Tanpa referensi desain — pola TenantStatusActions (Dialog konfirmasi) + TextAreaField, izin user.
export function PaymentDecisionActions({ tenantId, invoiceId, tenantName, invoiceNumber, totalAmount }: Props) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function close() {
    setMode(null);
    setReason("");
    setError(null);
  }

  async function submit() {
    setError(null);
    setSubmitting(true);
    try {
      const outcome = mode === "reject" ? await rejectPayment(tenantId, invoiceId, reason) : await confirmPayment(tenantId, invoiceId);
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
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => setMode("reject")}>
          Tolak
        </Button>
        <Button onClick={() => setMode("confirm")}>Konfirmasi lunas</Button>
      </div>
      <Dialog
        open={mode !== null}
        onClose={close}
        dismissible={!submitting}
        title={mode === "reject" ? `Tolak pembayaran ${invoiceNumber}?` : `Konfirmasi lunas ${formatRupiah(totalAmount)}?`}
        description={
          mode === "reject"
            ? `Tagihan ${tenantName} kembali bisa dibayar dengan QR & nominal yang sama. Alasan dikirim ke email pemilik usaha.`
            : `Pastikan ${formatRupiah(totalAmount)} persis (termasuk kode unik) sudah masuk di mutasi merchant. Langganan ${tenantName} langsung diperpanjang 1 bulan dan kuitansi dikirim ke pemilik usaha.`
        }
        footer={
          <>
            <Button variant="secondary" onClick={close} disabled={submitting}>
              Batal
            </Button>
            <Button onClick={submit} loading={submitting}>
              {mode === "reject" ? "Tolak pembayaran" : "Konfirmasi lunas"}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {error ? <FormAlert tone="danger">{error}</FormAlert> : null}
          {mode === "reject" ? (
            <TextAreaField
              id={`reject-reason-${invoiceId}`}
              label="Alasan"
              placeholder="Mis. nominal Rp 50.756 belum ada di mutasi merchant"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              disabled={submitting}
            />
          ) : null}
        </div>
      </Dialog>
    </>
  );
}

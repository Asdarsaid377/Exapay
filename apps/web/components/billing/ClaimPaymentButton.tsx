"use client";

import { BILLING_PROOF_ACCEPT, BILLING_PROOF_MAX_BYTES, formatRupiah } from "@exapay/shared";
import { FileText, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

import { claimInvoicePayment } from "@/actions/billing";
import { Button } from "@/components/common/Button";
import { Dialog } from "@/components/common/Dialog";
import { FileDropzone } from "@/components/common/FileDropzone";
import { FormAlert } from "@/components/common/FormAlert";
import { formatFileSize } from "@/lib/leaveLabels";

type Props = {
  invoiceId: string;
  invoiceNumber: string;
  totalAmount: string;
};

const PROOF_EXTENSIONS = [".pdf", ".jpg", ".jpeg", ".png"];

// "Saya sudah bayar" (feature 41): dialog konfirmasi + bukti bayar opsional → tagihan menunggu konfirmasi Exapay.
// Tanpa referensi desain — pola LeaveRequestFormDialog (Dialog + FileDropzone + baris file terpilih), izin user.
export function ClaimPaymentButton({ invoiceId, invoiceNumber, totalAmount }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | undefined>(undefined);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function close() {
    setOpen(false);
    setFile(null);
    setFileError(undefined);
    setFormError(null);
  }

  function selectFile(selected: File) {
    if (!PROOF_EXTENSIONS.some((ext) => selected.name.toLowerCase().endsWith(ext))) {
      setFileError("Bukti bayar harus berupa PDF, JPG, atau PNG");
      return;
    }
    if (selected.size > BILLING_PROOF_MAX_BYTES) {
      setFileError("Bukti bayar terlalu besar (maks. 5 MB)");
      return;
    }
    setFileError(undefined);
    setFile(selected);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    const formData = new FormData();
    formData.set("invoiceId", invoiceId);
    if (file) formData.set("proof", file, file.name);

    setSubmitting(true);
    try {
      const outcome = await claimInvoicePayment(formData);
      if (outcome.kind === "error") {
        setFormError(outcome.message);
        return;
      }
      close();
      router.refresh();
    } catch {
      setFormError("Tidak dapat terhubung ke server. Periksa koneksi Anda lalu coba lagi.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>Saya sudah bayar</Button>
      <Dialog
        open={open}
        onClose={close}
        dismissible={!submitting}
        title="Laporkan pembayaran"
        description={`Tagihan ${invoiceNumber} · ${formatRupiah(totalAmount)}. Exapay mencocokkan nominal dengan mutasi QRIS, lalu mengaktifkan langganan setelah pembayaran dikonfirmasi.`}
      >
        <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-4.5">
          {formError ? <FormAlert tone="danger">{formError}</FormAlert> : null}
          <div className="flex flex-col gap-1.5">
            <span className="text-[13px] font-bold text-text-primary">
              Bukti bayar <span className="font-normal text-text-tertiary">(opsional)</span>
            </span>
            {file ? (
              <div className="flex items-center gap-3 rounded-field border border-border-control bg-control py-1.5 pr-1.5 pl-3.5">
                <FileText aria-hidden className="size-5 shrink-0 text-text-secondary" />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-bold text-text-primary">{file.name}</span>
                  <span className="text-caption text-text-tertiary tabular-nums">{formatFileSize(file.size)}</span>
                </div>
                <button
                  type="button"
                  aria-label={`Hapus bukti ${file.name}`}
                  disabled={submitting}
                  onClick={() => setFile(null)}
                  className="grid size-11 shrink-0 place-items-center rounded-field text-text-secondary transition-colors hover:bg-fill-subtle hover:text-text-primary focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-accent/45 disabled:opacity-50"
                >
                  <X aria-hidden className="size-4.5" />
                </button>
              </div>
            ) : (
              <FileDropzone
                id="billing-proof"
                accept={BILLING_PROOF_ACCEPT}
                hint="PDF, JPG, atau PNG · maks. 5 MB · mis. tangkapan layar struk QRIS"
                onSelect={selectFile}
                disabled={submitting}
                error={fileError}
              />
            )}
          </div>
          <div className="mt-1 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={close} disabled={submitting}>
              Batal
            </Button>
            <Button type="submit" loading={submitting}>
              {submitting ? "Mengirim…" : "Laporkan pembayaran"}
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}

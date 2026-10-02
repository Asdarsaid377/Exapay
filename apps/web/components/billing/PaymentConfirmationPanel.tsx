"use client";

import { formatRupiah, type PaymentConfirmation } from "@exapay/shared";
import { useState } from "react";

import { decidePaymentConfirmation } from "@/actions/paymentConfirmations";
import { AuthHeading } from "@/components/auth/AuthHeading";
import { Button } from "@/components/common/Button";
import { FormAlert } from "@/components/common/FormAlert";
import { TextAreaField } from "@/components/common/TextAreaField";
import { formatDate, formatDateTime } from "@/lib/datetime";

type Props = {
  token: string;
  initial: PaymentConfirmation;
};

const ROW = "flex items-baseline justify-between gap-4 border-t border-border-subtle py-3 first:border-t-0 first:pt-0";
const LINK = "font-bold text-accent-strong hover:text-accent-hover hover:underline";

// Konfirmasi / tolak pembayaran dari tautan email tanpa login (feature 42). Membuka halaman tidak mengubah apa pun —
// keputusan hanya lewat tombol (POST), sehingga pemindai tautan email & prefetch browser tidak bisa memutuskan.
// Tanpa referensi desain — card AuthShell + baris dl (pola detail tenant) + TextAreaField, izin user.
export function PaymentConfirmationPanel({ token, initial }: Props) {
  const [confirmation, setConfirmation] = useState(initial);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<"confirm" | "reject" | null>(null);

  async function decide(decision: "confirm" | "reject") {
    setError(null);
    setSubmitting(decision);
    try {
      const outcome = await decidePaymentConfirmation(token, decision, decision === "reject" ? reason : undefined);
      if (outcome.kind === "error") {
        setError(outcome.message);
        return;
      }
      setConfirmation(outcome.confirmation);
      setRejecting(false);
    } catch {
      setError("Tidak dapat terhubung ke server. Periksa koneksi Anda lalu coba lagi.");
    } finally {
      setSubmitting(null);
    }
  }

  const pending = confirmation.state === "pending";

  return (
    <div className="flex flex-col gap-6">
      <AuthHeading title="Konfirmasi pembayaran" description={`${confirmation.tenantName} melaporkan sudah membayar tagihan langganan Exapay.`} />

      <div className="flex flex-col gap-1">
        <span className="text-sm text-text-secondary">Nominal yang harus ada di mutasi merchant</span>
        <span className="font-display text-[32px] leading-tight font-extrabold tracking-[-0.02em] text-text-primary tabular-nums">{formatRupiah(confirmation.totalAmount)}</span>
        <span className="text-[13px] text-text-tertiary">Termasuk kode unik {confirmation.uniqueCode}</span>
      </div>

      <dl className="flex flex-col">
        <div className={ROW}>
          <dt className="text-sm text-text-secondary">Usaha</dt>
          <dd className="text-right text-sm font-bold text-text-primary">{confirmation.tenantName}</dd>
        </div>
        <div className={ROW}>
          <dt className="text-sm text-text-secondary">Nomor tagihan</dt>
          <dd className="text-right text-sm text-text-primary tabular-nums">{confirmation.number}</dd>
        </div>
        {confirmation.claimedAt ? (
          <div className={ROW}>
            <dt className="text-sm text-text-secondary">Dilaporkan</dt>
            <dd className="text-right text-sm text-text-primary">{formatDateTime(confirmation.claimedAt)}</dd>
          </div>
        ) : null}
        <div className={ROW}>
          <dt className="text-sm text-text-secondary">Bukti bayar</dt>
          <dd className="text-right text-sm text-text-primary">
            {confirmation.hasProof && pending ? (
              <a href={`/payment/confirm/${token}/proof`} target="_blank" rel="noreferrer" className={LINK}>
                Lihat bukti
              </a>
            ) : confirmation.hasProof ? (
              "Diunggah"
            ) : (
              "Tidak ada"
            )}
          </dd>
        </div>
      </dl>

      {error ? <FormAlert tone="danger">{error}</FormAlert> : null}
      <StateNotice confirmation={confirmation} />

      {pending && rejecting ? (
        <div className="flex flex-col gap-4">
          <TextAreaField
            id="reject-reason"
            label="Alasan penolakan"
            hint="Dikirim ke email pemilik usaha. Tagihan kembali bisa dibayar dengan nominal yang sama."
            placeholder="Mis. nominal belum ada di mutasi merchant"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            disabled={submitting !== null}
          />
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={() => setRejecting(false)} disabled={submitting !== null}>
              Batal
            </Button>
            <Button variant="danger" onClick={() => void decide("reject")} loading={submitting === "reject"}>
              Tolak pembayaran
            </Button>
          </div>
        </div>
      ) : pending ? (
        <div className="flex flex-col gap-3">
          <Button size="lg" fullWidth onClick={() => void decide("confirm")} loading={submitting === "confirm"} disabled={submitting !== null}>
            Konfirmasi lunas
          </Button>
          <Button size="lg" variant="secondary" fullWidth onClick={() => setRejecting(true)} disabled={submitting !== null}>
            Tolak
          </Button>
          <p className="text-caption text-text-tertiary text-pretty">
            Konfirmasi lunas langsung memperpanjang langganan {confirmation.tenantName} 1 bulan dan mengirim kuitansi ke pemilik usaha. Tautan ini hanya bisa dipakai sekali.
          </p>
        </div>
      ) : null}
    </div>
  );
}

function StateNotice({ confirmation }: { confirmation: PaymentConfirmation }) {
  if (confirmation.state === "expired") {
    return <FormAlert tone="warning">Tautan ini sudah kedaluwarsa. Putuskan pembayaran lewat panel super-admin di menu Tagihan.</FormAlert>;
  }
  if (confirmation.state !== "decided") return null;
  if (confirmation.invoiceStatus === "paid") {
    return (
      <FormAlert tone="success">
        Pembayaran dikonfirmasi lunas.{confirmation.periodEndsAt ? ` Langganan aktif sampai ${formatDate(confirmation.periodEndsAt)}.` : ""} Kuitansi dikirim ke pemilik usaha.
      </FormAlert>
    );
  }
  if (confirmation.invoiceStatus === "awaiting_confirmation") {
    return <FormAlert tone="info">Tautan ini untuk laporan pembayaran sebelumnya. Gunakan tautan di email pemberitahuan terbaru.</FormAlert>;
  }
  if (confirmation.invoiceStatus === "open") {
    return <FormAlert tone="info">Pembayaran ditolak. Pemilik usaha sudah diberi tahu dan bisa membayar atau melapor ulang.</FormAlert>;
  }
  return <FormAlert tone="info">Tagihan ini sudah tidak menunggu konfirmasi.</FormAlert>;
}

import { type BillingInvoice, formatRupiah } from "@exapay/shared";
import { Download } from "lucide-react";

import { ClaimPaymentButton } from "@/components/billing/ClaimPaymentButton";
import { Badge } from "@/components/common/Badge";
import { buttonClassName } from "@/components/common/Button";
import { FormAlert } from "@/components/common/FormAlert";
import { ReadFields } from "@/components/common/ReadFields";
import { INVOICE_STATUS_LABELS, INVOICE_STATUS_TONES, invoiceQrHref } from "@/lib/billingLabels";
import { formatDateTime, formatIsoDate } from "@/lib/datetime";
import { formatFileSize } from "@/lib/leaveLabels";
import { rupiahNumber } from "@/lib/payrollRunLabels";

type Props = {
  invoice: BillingInvoice;
  qrisAvailable: boolean;
  // Route Handler QR gagal (mis. tagihan baru saja kedaluwarsa) → kembali dengan ?qris=error
  qrisError: boolean;
};

// Tagihan berjalan di /settings/billing (feature 41): QRIS bernominal persis + total + rincian + "Saya sudah bayar";
// setelah dilaporkan → status menunggu konfirmasi tanpa QR. Tanpa referensi desain — card glass-strong (pola
// FormSection) + angka total gaya StatTile + ReadFields, izin user.
export function InvoicePaymentCard({ invoice, qrisAvailable, qrisError }: Props) {
  const payable = invoice.status === "open";

  return (
    <section className="glass-strong flex flex-col gap-5 rounded-card p-4.5 lg:p-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h2 className="font-display text-base font-bold tracking-[-0.01em] text-text-primary lg:text-[17px]">Tagihan {invoice.number}</h2>
          <p className="text-small text-text-secondary">Terbit {formatDateTime(invoice.issuedAt)}</p>
        </div>
        <Badge tone={INVOICE_STATUS_TONES[invoice.status]}>{INVOICE_STATUS_LABELS[invoice.status]}</Badge>
      </div>

      <div className={`grid gap-6 ${payable ? "lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-10" : ""}`}>
        {payable ? (
          <div className="flex flex-col items-center gap-3">
            {qrisAvailable ? (
              <>
                {/* QR privat lewat Route Handler — next/image tidak dipakai */}
                <img
                  src={invoiceQrHref(invoice.id)}
                  alt={`QRIS untuk membayar ${formatRupiah(invoice.totalAmount)}`}
                  width={240}
                  height={240}
                  className="size-60 rounded-inner border border-border-subtle bg-surface-solid"
                />
                <a href={invoiceQrHref(invoice.id, true)} download className={buttonClassName({ variant: "secondary" })}>
                  <Download aria-hidden className="size-4.5" />
                  Unduh QR
                </a>
              </>
            ) : (
              <FormAlert tone="warning">Pembayaran QRIS belum tersedia. Hubungi Exapay untuk cara pembayaran.</FormAlert>
            )}
            {qrisError ? <FormAlert tone="danger">QR tidak dapat dimuat. Muat ulang halaman, lalu coba lagi.</FormAlert> : null}
          </div>
        ) : null}

        <div className="flex min-w-0 flex-col gap-5">
          <div className="flex flex-col gap-1">
            <span className="text-sm text-text-secondary">Total yang harus dibayar</span>
            <span className="flex items-baseline gap-1.5 font-display text-text-primary tabular-nums">
              <span className="text-[17px] font-bold">Rp</span>
              <span className="text-[26px] font-extrabold tracking-[-0.02em] lg:text-[32px]">{rupiahNumber(invoice.totalAmount)}</span>
            </span>
            {payable ? (
              <span className="text-[13px] text-text-tertiary text-pretty">
                Bayar persis sampai tiga digit terakhir (kode unik {invoice.uniqueCode}) agar pembayaran mudah dicocokkan.
              </span>
            ) : null}
          </div>

          <ReadFields
            fields={[
              {
                label: "Rincian",
                value: `${invoice.billedEmployees} karyawan × ${formatRupiah(invoice.pricePerEmployee)} = ${formatRupiah(invoice.baseAmount)}`,
                wide: true,
              },
              { label: "Kode unik", value: formatRupiah(String(invoice.uniqueCode)) },
              { label: "Periode mulai", value: `${formatIsoDate(invoice.periodStart)} · 1 bulan` },
              ...(payable
                ? [{ label: "Bayar sebelum", value: formatDateTime(invoice.dueAt) }]
                : [{ label: "Dilaporkan", value: invoice.claimedAt ? formatDateTime(invoice.claimedAt) : "—" }]),
              ...(invoice.proof ? [{ label: "Bukti bayar", value: `${invoice.proof.name} · ${formatFileSize(invoice.proof.size)}` }] : []),
            ]}
          />

          {payable ? (
            <div className="flex flex-col gap-3 border-t border-border-subtle pt-5 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-small text-text-secondary text-pretty">Sudah membayar lewat e-wallet atau m-banking? Laporkan agar Exapay segera mengonfirmasi.</p>
              <ClaimPaymentButton invoiceId={invoice.id} invoiceNumber={invoice.number} totalAmount={invoice.totalAmount} />
            </div>
          ) : (
            <FormAlert tone="info">Pembayaran sudah dilaporkan. Langganan aktif setelah Exapay mencocokkan pembayaran dengan mutasi QRIS.</FormAlert>
          )}
        </div>
      </div>
    </section>
  );
}

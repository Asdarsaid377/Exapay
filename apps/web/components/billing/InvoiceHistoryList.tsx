import { type BillingInvoice, formatRupiah } from "@exapay/shared";

import { Badge } from "@/components/common/Badge";
import { INVOICE_STATUS_LABELS, INVOICE_STATUS_TONES } from "@/lib/billingLabels";
import { formatDate } from "@/lib/datetime";

type Props = {
  invoices: BillingInvoice[];
};

// Riwayat tagihan langganan (feature 41), terbaru dulu. Tanpa referensi desain — pola PayrollRunList (glass-data,
// baris dipisah border-subtle) tanpa tautan: rincian tagihan berjalan ada di kartu tagihan di atasnya (izin user).
export function InvoiceHistoryList({ invoices }: Props) {
  return (
    <section className="overflow-hidden rounded-card glass-data">
      <ul>
        {invoices.map((invoice) => (
          <li
            key={invoice.id}
            className="grid min-h-16 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 border-t border-border-subtle px-4 py-3 first:border-t-0 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:px-5"
          >
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-[15px] font-bold text-text-primary">{invoice.number}</span>
              <span className="truncate text-caption text-text-tertiary tabular-nums">
                Terbit {formatDate(invoice.issuedAt)} · {invoice.billedEmployees} karyawan
              </span>
            </div>
            <span className="text-right text-[15px] font-bold text-text-primary tabular-nums">{formatRupiah(invoice.totalAmount)}</span>
            <div className="col-span-2 sm:col-span-1">
              <Badge tone={INVOICE_STATUS_TONES[invoice.status]}>{INVOICE_STATUS_LABELS[invoice.status]}</Badge>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

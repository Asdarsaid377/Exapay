import { type AdminBillingQueueItem, formatRupiah } from "@exapay/shared";
import Link from "next/link";

import { PaymentDecisionActions } from "@/components/admin/PaymentDecisionActions";
import { formatDateTime } from "@/lib/datetime";

type Props = {
  queue: AdminBillingQueueItem[];
};

const LINK = "font-bold text-accent-strong hover:text-accent-hover hover:underline";

// Antrean "Saya sudah bayar" lintas usaha di /admin/billing (feature 42), terlama dulu. Nominal persis ditonjolkan
// agar mudah dicocokkan dengan mutasi merchant. Tanpa referensi desain — pola daftar glass-data (PayrollRunList) +
// angka gaya StatTile, izin user.
export function PaymentQueueList({ queue }: Props) {
  return (
    <section className="overflow-hidden rounded-card glass-data">
      <ul>
        {queue.map((item) => (
          <li
            key={item.invoiceId}
            className="grid gap-x-6 gap-y-3 border-t border-border-subtle px-4 py-4 first:border-t-0 sm:px-5 lg:grid-cols-[minmax(0,1fr)_auto_auto] lg:items-center"
          >
            <div className="flex min-w-0 flex-col gap-0.5">
              <Link href={`/admin/tenants/${item.tenantId}`} className="truncate text-[15px] font-bold text-text-primary hover:underline">
                {item.tenantName}
              </Link>
              <span className="text-caption text-text-tertiary tabular-nums">
                {item.number} · {item.billedEmployees} karyawan · dilaporkan {formatDateTime(item.claimedAt)}
              </span>
              {item.hasProof ? (
                <a href={`/admin/billing/proof/${item.tenantId}/${item.invoiceId}`} target="_blank" rel="noreferrer" className={`text-sm ${LINK}`}>
                  Lihat bukti bayar
                </a>
              ) : (
                <span className="text-sm text-text-secondary">Tanpa bukti bayar</span>
              )}
            </div>
            <div className="flex flex-col lg:items-end">
              <span className="font-display text-[22px] font-extrabold tracking-[-0.02em] text-text-primary tabular-nums">{formatRupiah(item.totalAmount)}</span>
              <span className="text-caption text-text-tertiary">kode unik {item.uniqueCode}</span>
            </div>
            <PaymentDecisionActions
              tenantId={item.tenantId}
              invoiceId={item.invoiceId}
              tenantName={item.tenantName}
              invoiceNumber={item.number}
              totalAmount={item.totalAmount}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

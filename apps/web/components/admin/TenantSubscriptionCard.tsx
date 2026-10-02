import { type AdminTenantSubscription, formatRupiah } from "@exapay/shared";

import { TenantSubscriptionActions } from "@/components/admin/TenantSubscriptionActions";
import { Badge } from "@/components/common/Badge";
import { INVOICE_STATUS_LABELS, SUBSCRIPTION_STATUS_LABELS, SUBSCRIPTION_STATUS_TONES, formatSubscriptionDate } from "@/lib/billingLabels";
import { formatDateTime } from "@/lib/datetime";

type Props = {
  tenantId: string;
  tenantName: string;
  data: AdminTenantSubscription;
};

const ROW = "flex items-baseline justify-between gap-4 border-t border-border-subtle py-3 first:border-t-0 first:pt-0";

// Langganan satu usaha di /admin/tenants/[id] (feature 42) — pola card & baris dl halaman detail tenant (feature 07)
export function TenantSubscriptionCard({ tenantId, tenantName, data }: Props) {
  const { subscription, liveInvoice, platformPrice } = data;
  const price = data.pricePerEmployeeOverride ?? platformPrice.pricePerEmployee;
  const minimum = data.minBilledEmployeesOverride ?? platformPrice.minBilledEmployees;
  const custom = data.pricePerEmployeeOverride !== null || data.minBilledEmployeesOverride !== null;

  const rows: { label: string; value: string; strong?: boolean }[] = [
    {
      label: subscription.status === "past_due" ? "Masa tenggang sampai" : subscription.baseStatus === "trialing" ? "Trial berakhir" : "Dibayar sampai",
      value: subscription.status === "complimentary" ? "—" : formatSubscriptionDate(subscription.status === "past_due" ? subscription.graceEndsAt : subscription.endsAt),
    },
    { label: "Harga per karyawan", value: `${formatRupiah(price)}${custom ? " (khusus)" : ""}`, strong: custom },
    { label: "Minimum ditagih", value: `${minimum} karyawan` },
    {
      label: "Tagihan berjalan",
      value: liveInvoice ? `${liveInvoice.number} · ${formatRupiah(liveInvoice.totalAmount)} · ${INVOICE_STATUS_LABELS[liveInvoice.status]}` : "Tidak ada",
    },
  ];
  if (liveInvoice?.status === "open") rows.push({ label: "Batas bayar", value: formatDateTime(liveInvoice.dueAt) });

  return (
    <section className="glass-strong flex flex-col gap-4 rounded-card px-5 py-5 lg:px-6 lg:py-5.5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="font-display text-h2 font-bold text-text-primary">Langganan</h2>
          <p className="text-small text-text-secondary">Perubahan berlaku seketika dan tercatat di audit log usaha.</p>
        </div>
        <Badge tone={SUBSCRIPTION_STATUS_TONES[subscription.status]}>{SUBSCRIPTION_STATUS_LABELS[subscription.status]}</Badge>
      </div>
      <dl className="flex flex-col">
        {rows.map((row) => (
          <div key={row.label} className={ROW}>
            <dt className="text-sm text-text-secondary">{row.label}</dt>
            <dd className={`text-right text-sm text-text-primary tabular-nums ${row.strong ? "font-bold" : ""}`}>{row.value}</dd>
          </div>
        ))}
      </dl>
      <TenantSubscriptionActions
        tenantId={tenantId}
        tenantName={tenantName}
        baseStatus={subscription.baseStatus}
        pricePerEmployeeOverride={data.pricePerEmployeeOverride}
        minBilledEmployeesOverride={data.minBilledEmployeesOverride}
        defaultTrialDays={platformPrice.trialDays}
      />
    </section>
  );
}

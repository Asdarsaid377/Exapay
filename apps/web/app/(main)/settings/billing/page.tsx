import { type BillingOverview, formatRupiah } from "@exapay/shared";
import { CloudOff, ReceiptText } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Banner } from "@/components/common/Banner";
import { Badge } from "@/components/common/Badge";
import { EmptyState } from "@/components/common/EmptyState";
import { FormSection } from "@/components/common/FormSection";
import { ReadFields } from "@/components/common/ReadFields";
import { StatTile } from "@/components/common/StatTile";
import { PageHeader } from "@/components/layout/PageHeader";
import { fetchBillingOverview } from "@/lib/api/billing";
import {
  daysLeftLabel,
  formatSubscriptionDate,
  periodNoun,
  SUBSCRIPTION_STATUS_LABELS,
  SUBSCRIPTION_STATUS_TONES,
} from "@/lib/billingLabels";
import { formatIsoDate } from "@/lib/datetime";
import { rupiahNumber } from "@/lib/payrollRunLabels";

export const metadata: Metadata = { title: "Langganan — Exapay" };

const LINK = "font-bold text-accent-strong hover:text-accent-hover hover:underline";

// Langganan usaha (feature 40, khusus owner — proxy + API): status & sisa hari, estimasi tagihan bulan berikutnya,
// riwayat tagihan (kosong sampai feature 41). Dibangun tanpa referensi visual (turunan pola StatTile + FormSection).
export default async function SettingsBillingPage() {
  const result = await fetchBillingOverview();
  const header = <PageHeader title="Langganan" description="Status trial atau langganan dan perkiraan tagihan bulanan usaha ini." />;

  if (!result.ok) {
    return (
      <>
        {header}
        <EmptyState icon={CloudOff} title="Data langganan tidak dapat dimuat" description={result.error} />
      </>
    );
  }

  const { subscription, estimate } = result.data;
  const complimentary = subscription.status === "complimentary";

  return (
    <>
      {header}
      <StatusBanner overview={result.data} />

      <div className="grid gap-3 sm:grid-cols-2 lg:gap-4 xl:grid-cols-3">
        <StatusTile overview={result.data} />
        <StatTile
          label="Karyawan aktif"
          value={String(estimate.activeEmployees)}
          note={
            estimate.activeEmployees < estimate.minBilledEmployees
              ? `Ditagih minimum ${estimate.minBilledEmployees} karyawan`
              : `Ditagih ${estimate.billedEmployees} karyawan`
          }
        />
        <div className="sm:col-span-2 xl:col-span-1">
          <StatTile
            label="Estimasi tagihan / bulan"
            prefix="Rp"
            value={rupiahNumber(estimate.amount)}
            note={complimentary ? "Tidak ditagih selama status gratis (pilot)" : `${estimate.billedEmployees} × ${formatRupiah(estimate.pricePerEmployee)}`}
          />
        </div>
      </div>

      <FormSection
        title="Rincian estimasi"
        description="Tagihan dihitung dari jumlah karyawan aktif saat tagihan dibuat, dengan jumlah minimum yang ditagih."
      >
        <ReadFields
          fields={[
            { label: "Harga per karyawan aktif / bulan", value: formatRupiah(estimate.pricePerEmployee) },
            { label: "Minimum ditagih", value: `${estimate.minBilledEmployees} karyawan` },
            {
              label: "Karyawan aktif saat ini",
              value: (
                <Link href="/employees" className={LINK}>
                  {estimate.activeEmployees} karyawan
                </Link>
              ),
            },
            { label: "Jumlah ditagih", value: `${estimate.billedEmployees} karyawan` },
            { label: "Estimasi tagihan", value: formatRupiah(estimate.amount) },
            { label: "Harga berlaku per", value: formatIsoDate(estimate.priceDate) },
          ]}
        />
      </FormSection>

      <FormSection
        title="Masa tenggang & baca-saja"
        description="Data usaha tidak pernah dihapus karena langganan belum dibayar."
      >
        <p className="text-sm text-text-secondary text-pretty">
          Setelah trial atau periode langganan berakhir, usaha tetap bisa dipakai selama {estimate.graceDays} hari masa tenggang. Setelah itu usaha
          masuk mode baca-saja: data masih bisa dilihat dan diekspor, tetapi absen, log tugas, dan perubahan data ditahan sampai langganan aktif
          kembali. Pengingat dikirim ke email pemilik usaha 7, 3, dan 1 hari sebelum trial berakhir.
        </p>
      </FormSection>

      <section className="flex flex-col gap-3">
        <h2 className="px-1.5 font-display text-base font-bold tracking-[-0.01em] text-text-primary lg:text-[17px]">Riwayat tagihan</h2>
        <EmptyState icon={ReceiptText} title="Belum ada tagihan" description="Tagihan bulanan dan pembayaran QRIS akan tampil di sini." />
      </section>
    </>
  );
}

// Peringatan di halaman ini hanya untuk tenggang & baca-saja (banner AppShell disembunyikan di halaman ini)
function StatusBanner({ overview }: { overview: BillingOverview }) {
  const { subscription } = overview;
  if (subscription.status === "read_only") {
    return (
      <Banner
        tone="danger"
        title="Usaha dalam mode baca-saja"
        description={`${periodNoun(subscription)} dan masa tenggang telah berakhir pada ${formatSubscriptionDate(subscription.graceEndsAt)}. Data tetap aman dan bisa diekspor.`}
      />
    );
  }
  if (subscription.status === "past_due") {
    return (
      <Banner
        tone="warning"
        title={`${periodNoun(subscription)} telah berakhir`}
        description={`Masa tenggang sampai ${formatSubscriptionDate(subscription.graceEndsAt)}; mode baca-saja mulai ${daysLeftLabel(subscription.daysLeft ?? 0)}.`}
      />
    );
  }
  return null;
}

function StatusTile({ overview }: { overview: BillingOverview }) {
  const { subscription } = overview;
  const badge = <Badge tone={SUBSCRIPTION_STATUS_TONES[subscription.status]}>{SUBSCRIPTION_STATUS_LABELS[subscription.status]}</Badge>;
  const days = String(Math.max(subscription.daysLeft ?? 0, 0));

  switch (subscription.status) {
    case "trialing":
      return <StatTile label="Sisa trial" value={days} suffix="hari" badge={badge} note={`Berakhir ${formatSubscriptionDate(subscription.endsAt)}`} />;
    case "active":
      return <StatTile label="Sisa periode" value={days} suffix="hari" badge={badge} note={`Dibayar sampai ${formatSubscriptionDate(subscription.endsAt)}`} />;
    case "past_due":
      return (
        <StatTile label="Sisa tenggang" value={days} suffix="hari" badge={badge} note={`Baca-saja mulai ${formatSubscriptionDate(subscription.graceEndsAt)}`} />
      );
    case "read_only":
      return <StatTile label="Status" value="Baca-saja" badge={badge} note={`Sejak ${formatSubscriptionDate(subscription.graceEndsAt)}`} />;
    case "complimentary":
      return <StatTile label="Status" value="Gratis" badge={badge} note="Usaha pilot — tanpa tagihan" />;
  }
}

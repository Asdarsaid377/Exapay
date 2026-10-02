import { type BillingPriceVersion, formatRupiah } from "@exapay/shared";
import { CircleCheck, CloudOff } from "lucide-react";
import type { Metadata } from "next";

import { PaymentQueueList } from "@/components/admin/PaymentQueueList";
import { PlatformPriceDialog } from "@/components/admin/PlatformPriceDialog";
import { Badge } from "@/components/common/Badge";
import { EmptyState } from "@/components/common/EmptyState";
import { FormAlert } from "@/components/common/FormAlert";
import { FormSection } from "@/components/common/FormSection";
import { ReadFields } from "@/components/common/ReadFields";
import { PageHeader } from "@/components/layout/PageHeader";
import { fetchAdminBilling } from "@/lib/api/adminBilling";
import { formatIsoDate } from "@/lib/datetime";

export const metadata: Metadata = { title: "Tagihan — Panel Super-admin Exapay" };

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const SECTION_TITLE = "px-1.5 font-display text-base font-bold tracking-[-0.01em] text-text-primary lg:text-[17px]";

// /admin/billing (feature 42): antrean konfirmasi "Saya sudah bayar" + harga platform berlaku-tanggal.
// Konfirmasi juga bisa langsung dari tautan di email pemberitahuan (tanpa login). Tanpa referensi desain, izin user.
export default async function AdminBillingPage({ searchParams }: Props) {
  const [result, params] = await Promise.all([fetchAdminBilling(), searchParams]);
  const header = (
    <PageHeader title="Tagihan" description="Cocokkan laporan pembayaran dengan mutasi merchant QRIS, lalu konfirmasi atau tolak." />
  );
  if (!result.ok) {
    return (
      <>
        {header}
        <EmptyState icon={CloudOff} title="Data tagihan tidak dapat dimuat" description={result.error} />
      </>
    );
  }

  const { queue, prices, today } = result.data;
  const current = prices.find((version) => version.effectiveFrom <= today && (!version.effectiveTo || version.effectiveTo >= today)) ?? null;
  const tomorrow = new Date(Date.parse(`${today}T00:00:00Z`) + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  return (
    <>
      {header}
      {params.proof === "error" ? <FormAlert tone="danger">Bukti bayar tidak dapat dibuka. Coba lagi beberapa saat lagi.</FormAlert> : null}

      <section className="flex flex-col gap-3">
        <h2 className={SECTION_TITLE}>Menunggu konfirmasi{queue.length > 0 ? ` (${queue.length})` : ""}</h2>
        {queue.length > 0 ? (
          <PaymentQueueList queue={queue} />
        ) : (
          <EmptyState icon={CircleCheck} iconTone="success" title="Tidak ada pembayaran menunggu" description="Laporan &quot;Saya sudah bayar&quot; dari pemilik usaha akan muncul di sini dan dikirim ke email Anda." />
        )}
      </section>

      <FormSection
        title="Harga platform"
        description="Dipakai tagihan yang terbit pada tanggal berlakunya. Usaha dengan harga khusus diatur di halaman tenant."
        aside={<PlatformPriceDialog current={current} minDate={tomorrow} />}
      >
        {current ? (
          <ReadFields
            fields={[
              { label: "Harga per karyawan aktif / bulan", value: formatRupiah(current.pricePerEmployee) },
              { label: "Minimum ditagih", value: `${current.minBilledEmployees} karyawan` },
              { label: "Lama trial usaha baru", value: `${current.trialDays} hari` },
              { label: "Masa tenggang", value: `${current.graceDays} hari` },
              { label: "Berlaku sejak", value: formatIsoDate(current.effectiveFrom) },
              { label: "Berlaku sampai", value: current.effectiveTo ? formatIsoDate(current.effectiveTo) : "Sampai diganti" },
            ]}
          />
        ) : (
          <FormAlert tone="warning">Tidak ada harga yang berlaku hari ini.</FormAlert>
        )}
      </FormSection>

      <section className="flex flex-col gap-3">
        <h2 className={SECTION_TITLE}>Riwayat & jadwal harga</h2>
        <PriceVersionList prices={prices} today={today} />
      </section>
    </>
  );
}

function PriceVersionList({ prices, today }: { prices: BillingPriceVersion[]; today: string }) {
  return (
    <section className="overflow-hidden rounded-card glass-data">
      <ul>
        {prices.map((version) => {
          const scheduled = version.effectiveFrom > today;
          const ended = version.effectiveTo !== null && version.effectiveTo < today;
          return (
            <li key={version.id} className="grid min-h-16 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 border-t border-border-subtle px-4 py-3 first:border-t-0 sm:px-5">
              <div className="flex min-w-0 flex-col">
                <span className="text-[15px] font-bold text-text-primary tabular-nums">
                  {formatRupiah(version.pricePerEmployee)} / karyawan · min. {version.minBilledEmployees} · trial {version.trialDays} hari · tenggang {version.graceDays} hari
                </span>
                <span className="truncate text-caption text-text-tertiary">
                  {formatIsoDate(version.effectiveFrom)} – {version.effectiveTo ? formatIsoDate(version.effectiveTo) : "sampai diganti"}
                  {version.note ? ` · ${version.note}` : ""}
                </span>
              </div>
              <Badge tone={scheduled ? "info" : ended ? "outline" : "success"}>{scheduled ? "Terjadwal" : ended ? "Selesai" : "Berlaku"}</Badge>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

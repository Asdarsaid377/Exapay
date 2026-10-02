import { billingEstimateAmount, formatRupiah, type PublicBillingPrice } from "@exapay/shared";

import { PriceCalculator } from "@/components/landing/PriceCalculator";
import { SectionIntro } from "@/components/landing/SectionIntro";
import { LANDING_INCLUDED } from "@/lib/landingContent";

type Props = {
  // null = harga belum bisa dimuat dari API
  price: PublicBillingPrice | null;
  ctaLabel: string;
};

function compactRupiah(value: string): string {
  return formatRupiah(value).replace("Rp ", "Rp");
}

// Harga (#harga): kartu harga + kalkulator. Semua angka dari data harga berlaku (GET /billing/public/price) — tidak hardcode.
export function LandingPricing({ price, ctaLabel }: Props) {
  return (
    <section id="harga" className="flex scroll-mt-24 flex-col gap-5 pb-section-sm lg:gap-10 lg:pb-section">
      <SectionIntro title="Satu harga, semua fitur">Bayar sesuai jumlah karyawan aktif. Tanpa paket, tanpa biaya tambahan.</SectionIntro>

      {price ? (
        <div className="grid items-stretch gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-6">
          <div className="flex flex-col gap-4.5 rounded-card border border-border-subtle bg-surface-solid p-5.5 shadow-glass-lg lg:gap-6 lg:p-9">
            <div className="flex flex-col gap-1.5 lg:gap-2">
              <div className="flex flex-col gap-1.5 lg:flex-row lg:flex-wrap lg:items-baseline lg:gap-2.5">
                <span className="font-display text-[42px] leading-none font-extrabold tracking-[-0.035em] tabular-nums lg:text-price">
                  {compactRupiah(price.pricePerEmployee)}
                </span>
                <span className="text-[15px] text-text-secondary lg:text-[17px]">per karyawan aktif / bulan</span>
              </div>
              <span className="text-sm leading-normal text-text-secondary lg:text-[15px]">
                {price.minBilledEmployees > 0
                  ? `Minimum ditagih ${price.minBilledEmployees} karyawan (${compactRupiah(billingEstimateAmount(price.pricePerEmployee, price.minBilledEmployees, 0))}/bulan) · `
                  : ""}
                {price.trialDays > 0 ? `Trial gratis ${price.trialDays} hari · ` : ""}Bayar via QRIS
              </span>
            </div>
            <div className="flex flex-col gap-1">
              <h3 className="pb-1.5 font-display text-sm font-bold lg:pb-2 lg:text-[15px]">Sudah termasuk</h3>
              <ul className="grid lg:grid-cols-2 lg:gap-x-6">
                {LANDING_INCLUDED.map((item) => (
                  <li key={item} className="border-t border-border-subtle py-2.25 text-sm leading-[1.4] lg:py-2.75 lg:text-[15px]">
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <PriceCalculator pricePerEmployee={price.pricePerEmployee} minBilledEmployees={price.minBilledEmployees} ctaLabel={ctaLabel} />
        </div>
      ) : (
        <div className="glass-strong flex flex-col gap-1.5 rounded-card p-5.5 lg:p-8">
          <span className="font-display text-base font-bold">Harga sedang tidak dapat dimuat</span>
          <span className="text-[15px] text-text-secondary">Muat ulang halaman ini beberapa saat lagi.</span>
        </div>
      )}

      <p className="text-sm leading-normal text-text-secondary lg:text-[15px]">
        Tidak bayar setelah trial? Data tidak dihapus — akun menjadi baca-saja sampai tagihan dibayar.
      </p>
    </section>
  );
}

import { Badge } from "@/components/common/Badge";

const INDICATORS = [
  { label: "Penjualan menu baru", pct: 100, meta: "42 dari target 40 cup · bobot 40%" },
  { label: "Checklist kebersihan kasir", pct: 86, meta: "26 dari 30 hari · bobot 35%" },
  { label: "Pesanan tersaji < 5 menit", pct: 64, meta: "58% pesanan dari target 90% · bobot 25%" },
] as const;

// Cuplikan skor KPI + draf ringkasan AI (blok fitur Tugas harian → KPI)
export function KpiPreview() {
  return (
    <div role="img" aria-label="Contoh skor KPI 86 predikat Baik dengan tiga indikator dan draf ringkasan AI" className="flex flex-col gap-3.5 rounded-[14px] border border-border-subtle bg-surface-solid p-4.5 lg:gap-5 lg:rounded-card lg:px-7 lg:py-6.5">
      <div className="flex items-center justify-between gap-4 lg:items-start">
        <div className="flex flex-col gap-0.5">
          <span className="font-display text-sm font-bold lg:text-base">
            <span className="lg:hidden">Rina · Sep 2026</span>
            <span className="hidden lg:inline">Rina Wulandari · Kasir</span>
          </span>
          <span className="hidden text-[13px] text-text-secondary lg:block">Skor KPI September 2026</span>
        </div>
        <div className="flex items-baseline gap-2 lg:gap-2.5">
          <span className="font-display text-4xl leading-none font-extrabold tracking-[-0.03em] lg:text-[52px]">86</span>
          <Badge tone="accent">Baik</Badge>
        </div>
      </div>
      <div className="flex flex-col gap-3.5 lg:gap-4">
        {INDICATORS.map((indicator) => (
          <div key={indicator.label} className="flex flex-col gap-1.5 lg:gap-1.75">
            <div className="flex items-baseline justify-between gap-2 text-[13px] font-bold lg:gap-3 lg:text-[14.5px]">
              <span>{indicator.label}</span>
              <span className="tabular-nums">{indicator.pct}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-chart-track lg:h-2.5">
              <div className="h-full rounded-full bg-accent" style={{ width: `${indicator.pct}%` }} />
            </div>
            <span className="hidden text-[12.5px] text-text-secondary lg:block">{indicator.meta}</span>
          </div>
        ))}
      </div>
      <div className="hidden flex-col gap-1.5 rounded-inner border border-warning-border bg-warning-surface px-4 py-3.5 lg:flex">
        <span className="text-[13px] font-bold text-warning-text">Draf ringkasan AI · menunggu tinjauan atasan</span>
        <span className="text-[13.5px] leading-normal text-neutral-text">
          Penjualan menu baru melampaui target. Ketepatan waktu saji masih di bawah target pada jam ramai.
        </span>
      </div>
    </div>
  );
}

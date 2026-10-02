import { Badge } from "@/components/common/Badge";

// Angka konsisten dengan engine: bruto PPh = 7.200.000 + BPJS Kes pemberi kerja 4% + JKK 0,24% + JKM 0,3% = 7.526.880
// → TER A 1,5% = 112.903
const LINES = [
  { label: "Gaji pokok", value: "Rp 6.500.000", deduction: false },
  { label: "Tunjangan transport & makan", value: "Rp 700.000", deduction: false },
  { label: "BPJS Kesehatan 1%", value: "− Rp 72.000", deduction: true },
  { label: "BPJS Ketenagakerjaan (JHT 2%, JP 1%)", value: "− Rp 216.000", deduction: true },
  { label: "PPh 21 TER kategori A 1,5%", value: "− Rp 112.903", deduction: true },
] as const;

// Cuplikan slip gaji (blok fitur Payroll)
export function SlipPreview() {
  return (
    <div role="img" aria-label="Contoh slip gaji final dengan rincian BPJS dan PPh 21" className="surface-solid flex flex-col gap-0 rounded-[20px] px-4.5 py-4 lg:gap-1.5 lg:rounded-card lg:px-7 lg:py-6">
      <div className="hidden items-start justify-between pb-2.5 lg:flex">
        <div className="flex flex-col gap-0.5">
          <span className="font-display text-base font-bold">Slip gaji · Dimas Pratama</span>
          <span className="text-[13px] text-text-secondary">Kepala barista · Oktober 2026</span>
        </div>
        <Badge tone="success">Final</Badge>
      </div>
      {LINES.map((line) => (
        <div
          key={line.label}
          className="flex justify-between gap-2.5 border-b border-border-subtle py-2 text-[13px] lg:gap-4 lg:border-t lg:border-b-0 lg:py-2.5 lg:text-[14.5px]"
        >
          <span className="text-text-secondary">{line.label}</span>
          <span className={`shrink-0 tabular-nums lg:font-medium ${line.deduction ? "text-danger-text" : ""}`}>{line.value}</span>
        </div>
      ))}
      <div className="flex items-baseline justify-between pt-2.5 lg:border-t lg:border-text-primary/20 lg:pt-3.5">
        <span className="font-display text-sm font-bold lg:text-[15px]">Gaji bersih</span>
        <span className="font-display text-[17px] font-extrabold tracking-[-0.02em] tabular-nums lg:text-2xl">Rp 6.799.097</span>
      </div>
    </div>
  );
}

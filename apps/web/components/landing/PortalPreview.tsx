import { ChevronRight } from "lucide-react";

const ITEMS = [
  { label: "Slip gaji September", value: "Rp 3.952.400" },
  { label: "Skor KPI September", value: "86" },
  { label: "Absensi Oktober", value: "2 hari hadir" },
  { label: "Ajukan izin", value: "" },
] as const;

// Cuplikan menu portal karyawan (blok fitur Portal karyawan)
export function PortalPreview() {
  return (
    <div role="img" aria-label="Contoh portal karyawan: slip gaji, skor KPI, absensi, ajukan izin" className="flex justify-center">
      <div className="surface-solid flex w-95 flex-col rounded-card px-5.5 pt-5.5 pb-2.5">
        <div className="flex flex-col gap-0.5 pb-2.5">
          <span className="font-display text-[15px] font-bold">Portal saya</span>
          <span className="text-[13px] text-text-secondary">Rina Wulandari · Kasir</span>
        </div>
        {ITEMS.map((item) => (
          <div key={item.label} className="flex min-h-13 items-center gap-3 border-t border-border-subtle">
            <span className="flex-1 text-[14.5px]">{item.label}</span>
            <span className="text-[14.5px] font-bold tabular-nums">{item.value}</span>
            <ChevronRight aria-hidden className="size-4 text-text-secondary" />
          </div>
        ))}
      </div>
    </div>
  );
}

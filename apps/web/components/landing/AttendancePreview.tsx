import { LogIn } from "lucide-react";

import { Badge } from "@/components/common/Badge";

// Cuplikan kartu absen portal (blok fitur Absensi)
export function AttendancePreview() {
  return (
    <div role="img" aria-label="Contoh kartu absen masuk di portal karyawan" className="flex justify-center">
      <div className="surface-solid flex w-95 flex-col gap-3.5 rounded-card p-5.5">
        <div className="flex justify-between">
          <span className="font-display text-[15px] font-bold">Absensi hari ini</span>
          <span className="text-[13px] text-text-secondary">Jumat, 2 Okt 2026</span>
        </div>
        <div className="flex items-baseline gap-2.5">
          <span className="font-display text-[44px] leading-none font-extrabold tracking-[-0.02em] tabular-nums">07.56</span>
          <span className="text-[13.5px] text-text-secondary">waktu server · WITA</span>
        </div>
        <span className="text-[13.5px] text-text-secondary">Shift pagi · 08.00–16.00 · Kopi Nusantara Pettarani</span>
        <span className="flex h-12 items-center justify-center gap-2 rounded-full bg-accent font-display text-[15px] font-bold text-on-accent">
          <LogIn aria-hidden className="size-4.5" />
          Absen masuk
        </span>
        <div className="flex flex-col text-[13.5px]">
          <div className="flex justify-between border-t border-border-subtle py-2.5">
            <span className="text-text-secondary">Kamis, 1 Okt</span>
            <span>Masuk 07.52 · Pulang 16.05</span>
          </div>
          <div className="flex items-center justify-between border-t border-border-subtle py-2.5">
            <span className="text-text-secondary">Senin, 5 Okt</span>
            <Badge tone="info">Cuti · menunggu atasan</Badge>
          </div>
        </div>
      </div>
    </div>
  );
}

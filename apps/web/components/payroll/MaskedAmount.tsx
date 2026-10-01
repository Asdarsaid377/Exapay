"use client";

import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";

type Props = {
  // Sudah diformat ("Rp 4.125.000")
  value: string;
  label: string;
};

// Nominal tersamar dengan tombol Lihat/Sembunyikan (snapshot me.html kartu "Slip gaji terakhir") — angka gaji tidak
// tampil di layar sampai diminta
export function MaskedAmount({ value, label }: Props) {
  const [shown, setShown] = useState(false);
  return (
    <button
      type="button"
      onClick={() => setShown((current) => !current)}
      aria-pressed={shown}
      aria-label={shown ? `Sembunyikan ${label}` : `Lihat ${label}`}
      className="-mx-1 flex min-h-11 items-center justify-between gap-3 rounded-[14px] px-1 text-left focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-accent/45"
    >
      <span
        className={`font-display text-[19px] font-extrabold text-text-primary tabular-nums ${shown ? "tracking-[-0.01em]" : "tracking-[0.08em]"}`}
      >
        {shown ? value : "Rp ••••••••"}
      </span>
      <span className="flex items-center gap-1.5 font-display text-[13px] font-bold text-accent-strong">
        {shown ? <EyeOff aria-hidden className="size-4.5" /> : <Eye aria-hidden className="size-4.5" />}
        {shown ? "Sembunyikan" : "Lihat"}
      </span>
    </button>
  );
}

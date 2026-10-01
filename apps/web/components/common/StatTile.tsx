import type { ReactNode } from "react";

type Props = {
  label: string;
  value: string;
  // Satuan sebelum/sesudah angka (snapshot: "Rp" J 700 17px · "/18" J 600 20px sekunder)
  prefix?: string;
  suffix?: string;
  // Catatan kecil di bawah angka
  note?: string;
  badge?: ReactNode;
};

// Stat tile (snapshot dashboard.html): kaca kuat, label · angka besar tabular · catatan
export function StatTile({ label, value, prefix, suffix, note, badge }: Props) {
  return (
    <div className="glass-strong flex h-full min-h-30 flex-col gap-2.5 rounded-card p-5 lg:min-h-34">
      <div className="flex min-h-6 items-center justify-between gap-2">
        <span className="text-sm text-text-secondary">{label}</span>
        {badge}
      </div>
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-1.5">
        {prefix ? <span className="font-display text-[15px] font-bold text-text-primary lg:text-[17px]">{prefix}</span> : null}
        <span className="font-display text-[26px] leading-none font-extrabold tracking-[-0.02em] text-text-primary tabular-nums lg:text-num">{value}</span>
        {suffix ? <span className="font-display text-base font-semibold text-text-secondary tabular-nums lg:text-xl">{suffix}</span> : null}
      </div>
      {note ? <span className="text-[13px] text-text-tertiary">{note}</span> : null}
    </div>
  );
}

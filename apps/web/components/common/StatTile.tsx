import type { ReactNode } from "react";

type Props = {
  label: string;
  value: string;
  // Catatan kecil di bawah angka
  note?: string;
  badge?: ReactNode;
};

// Stat tile (snapshot dashboard.html): kaca kuat, label · angka besar tabular · catatan
export function StatTile({ label, value, note, badge }: Props) {
  return (
    <div className="glass-strong flex min-h-30 flex-col gap-2.5 rounded-card p-5 lg:min-h-34">
      <div className="flex min-h-6 items-center justify-between gap-2">
        <span className="text-sm text-text-secondary">{label}</span>
        {badge}
      </div>
      <span className="font-display text-[26px] leading-none font-extrabold tracking-[-0.02em] text-text-primary tabular-nums lg:text-num">{value}</span>
      {note ? <span className="text-[13px] text-text-tertiary">{note}</span> : null}
    </div>
  );
}

import { MONTH_SHORT_LABELS } from "@/lib/workCalendarLabels";

type Props = {
  // YYYY-MM-DD
  date: string;
  muted?: boolean;
};

// Kolom tanggal di daftar (ui-rules "Tanggal di daftar pengingat"): tanggal J 800 20px + bulan 12px, lebar 44px
export function CalendarDate({ date, muted = false }: Props) {
  const day = Number(date.slice(8, 10));
  const month = MONTH_SHORT_LABELS[Number(date.slice(5, 7)) - 1];
  return (
    <div className="flex w-11 shrink-0 flex-col items-center">
      <span className={`font-display text-xl leading-none font-extrabold tabular-nums ${muted ? "text-text-tertiary" : "text-text-primary"}`}>{day}</span>
      <span className="mt-1 text-xs text-text-tertiary">{month}</span>
    </div>
  );
}

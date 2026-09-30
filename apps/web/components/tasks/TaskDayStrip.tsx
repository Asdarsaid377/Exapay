import type { MyTaskDay } from "@exapay/shared";
import Link from "next/link";

import { longDate, myTasksHref, weekdayShort } from "@/lib/taskLogLabels";

type Props = {
  day: MyTaskDay;
};

// Pilih tanggal di jendela catat (hari ini + 7 hari ke belakang), terlama di kiri. Tanggal tanpa absen masuk diredupkan.
// Tanpa referensi desain — pola AttendanceMonthNav (surface-solid rounded-[20px] p-1.5) (feature 19, izin user).
export function TaskDayStrip({ day }: Props) {
  if (day.days.length === 0) return null;
  const days = [...day.days].reverse();
  return (
    <nav aria-label="Pilih tanggal" className="surface-solid grid grid-cols-8 gap-1 rounded-[20px] p-1.5">
      {days.map((item) => {
        const selected = item.date === day.date;
        const summary = `${longDate(item.date)}${item.date === day.today ? " (hari ini)" : ""} — ${item.checkedIn ? `${item.count} catatan` : "belum absen masuk"}`;
        return (
          <Link
            key={item.date}
            href={myTasksHref(item.date, day.today)}
            aria-current={selected ? "date" : undefined}
            aria-label={summary}
            title={summary}
            className={`flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-[14px] transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-accent/45 ${
              selected ? "bg-accent-soft text-accent-strong" : "hover:bg-fill-subtle"
            }`}
          >
            <span className={`text-xs ${selected ? "font-bold" : item.checkedIn ? "text-text-secondary" : "text-text-muted"}`}>
              {weekdayShort(item.date)}
            </span>
            <span className={`font-display text-[17px] leading-none font-extrabold tabular-nums ${selected ? "" : item.checkedIn ? "text-text-primary" : "text-text-muted"}`}>
              {Number(item.date.slice(8, 10))}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

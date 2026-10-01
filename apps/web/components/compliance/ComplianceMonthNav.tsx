import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";

import { complianceHref } from "@/lib/complianceLabels";
import { monthLabel, shiftMonth } from "@/lib/attendanceLabels";

type Props = {
  month: string;
  // Bulan berjalan (zona waktu usaha)
  currentMonth: string;
};

const ARROW_CLASSES =
  "flex size-11 shrink-0 items-center justify-center rounded-field text-text-primary transition-colors hover:bg-fill-subtle focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-accent/45";

// Pilih bulan kalender kepatuhan (feature 33) — panel kaca pola AttendancePeriodNav tanpa rentang; boleh maju ke bulan
// depan (tenggat yang akan datang). Bulan di URL ?month=YYYY-MM.
export function ComplianceMonthNav({ month, currentMonth }: Props) {
  const previous = shiftMonth(month, -1);
  const next = shiftMonth(month, 1);
  return (
    <div className="glass flex items-center gap-2 rounded-card p-2 sm:gap-2.5 sm:p-2.5">
      <nav aria-label="Pilih bulan" className="flex min-w-0 flex-1 items-center justify-between gap-1 sm:flex-none sm:justify-start">
        <Link href={complianceHref(previous, currentMonth)} scroll={false} aria-label={`Bulan sebelumnya, ${monthLabel(previous)}`} className={ARROW_CLASSES}>
          <ChevronLeft aria-hidden className="size-5" />
        </Link>
        <span aria-current="page" className="truncate px-1 text-center font-display text-[17px] font-bold text-text-primary tabular-nums sm:min-w-44">
          {monthLabel(month)}
        </span>
        <Link href={complianceHref(next, currentMonth)} scroll={false} aria-label={`Bulan berikutnya, ${monthLabel(next)}`} className={ARROW_CLASSES}>
          <ChevronRight aria-hidden className="size-5" />
        </Link>
      </nav>
      {month !== currentMonth ? (
        <Link
          href="/compliance"
          scroll={false}
          className="ml-auto hidden min-h-11 items-center px-3 text-sm font-bold text-accent-strong hover:text-accent-hover hover:underline focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-accent/45 sm:inline-flex"
        >
          Bulan ini
        </Link>
      ) : null}
    </div>
  );
}

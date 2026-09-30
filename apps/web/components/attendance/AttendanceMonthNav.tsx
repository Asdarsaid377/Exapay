import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";

import { monthHref, monthLabel, shiftMonth } from "@/lib/attendanceLabels";

type Props = {
  // YYYY-MM
  month: string;
  currentMonth: string;
  // Halaman portal yang dibuka (riwayat absensi / kinerja)
  basePath?: string;
};

const ARROW_CLASSES =
  "flex size-11 items-center justify-center rounded-field text-text-primary transition-colors hover:bg-fill-subtle focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-accent/45";

// Pindah bulan di portal (riwayat absensi, kinerja saya). Bulan setelah bulan berjalan tidak bisa dibuka.
export function AttendanceMonthNav({ month, currentMonth, basePath = "/me/attendance" }: Props) {
  const previous = shiftMonth(month, -1);
  const next = shiftMonth(month, 1);
  return (
    <nav aria-label="Pilih bulan" className="surface-solid flex items-center justify-between gap-2 rounded-[20px] p-1.5">
      <Link href={monthHref(basePath, previous, currentMonth)} aria-label={`Bulan sebelumnya, ${monthLabel(previous)}`} className={ARROW_CLASSES}>
        <ChevronLeft aria-hidden className="size-5" />
      </Link>
      <span aria-current="page" className="font-display text-[17px] font-bold text-text-primary">
        {monthLabel(month)}
      </span>
      {month < currentMonth ? (
        <Link href={monthHref(basePath, next, currentMonth)} aria-label={`Bulan berikutnya, ${monthLabel(next)}`} className={ARROW_CLASSES}>
          <ChevronRight aria-hidden className="size-5" />
        </Link>
      ) : (
        <span aria-hidden className="flex size-11 items-center justify-center text-text-muted">
          <ChevronRight className="size-5" />
        </span>
      )}
    </nav>
  );
}

"use client";

import { attendancePeriodQuerySchema } from "@exapay/shared";
import { CalendarRange, ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/common/Button";
import { Dialog } from "@/components/common/Dialog";
import { TextField } from "@/components/common/TextField";
import { monthLabel, shiftMonth } from "@/lib/attendanceLabels";
import { type PeriodView, periodLabel, periodSearchParams } from "@/lib/attendanceRecapLabels";

type Props = {
  view: PeriodView;
  // Bulan berjalan di zona waktu usaha (YYYY-MM) — bulan setelahnya tidak bisa dibuka
  currentMonth: string;
  // Rentang tampilan sekarang (untuk isi awal dialog)
  from: string;
  to: string;
  basePath: string;
  // Parameter lain yang dipertahankan saat periode berganti (mis. karyawan terpilih)
  keep?: Record<string, string>;
  // Keterangan di dialog rentang
  rangeHint?: string;
};

const ARROW_CLASSES =
  "flex size-11 shrink-0 items-center justify-center rounded-field text-text-primary transition-colors hover:bg-fill-subtle focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-accent/45";

// Pilih periode rekap/koreksi: panah per bulan, atau rentang bebas (maks. 92 hari) lewat dialog. Periode di URL.
// Tanpa referensi desain (feature 16, izin user) — pola AttendanceMonthNav + panel filter EmployeeFilters.
export function AttendancePeriodNav({ view, currentMonth, from, to, basePath, keep = {}, rangeHint = "Maksimal 92 hari. Hari ini dan sesudahnya belum dihitung alpa." }: Props) {
  const router = useRouter();
  const [loading, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [rangeFrom, setRangeFrom] = useState(from);
  const [rangeTo, setRangeTo] = useState(to);
  const [error, setError] = useState<string | null>(null);

  function hrefFor(next: PeriodView): string {
    const params = new URLSearchParams(keep);
    for (const [key, value] of periodSearchParams(next, currentMonth)) params.set(key, value);
    const query = params.toString();
    return query ? `${basePath}?${query}` : basePath;
  }

  function openDialog() {
    setRangeFrom(from);
    setRangeTo(to);
    setError(null);
    setOpen(true);
  }

  function applyRange() {
    const parsed = attendancePeriodQuerySchema.safeParse({ from: rangeFrom || undefined, to: rangeTo || undefined });
    if (!parsed.success || !parsed.data.from || !parsed.data.to) {
      setError(parsed.success ? "Isi tanggal mulai dan selesai" : (parsed.error.issues[0]?.message ?? "Rentang tidak valid"));
      return;
    }
    const next: PeriodView = { kind: "range", from: parsed.data.from, to: parsed.data.to };
    setOpen(false);
    startTransition(() => router.push(hrefFor(next), { scroll: false }));
  }

  const month = view.kind === "month" ? view.month : null;
  const previous = month ? shiftMonth(month, -1) : null;
  const next = month ? shiftMonth(month, 1) : null;

  return (
    <>
      <div aria-busy={loading} className="glass flex flex-wrap items-center gap-2 rounded-card p-2 sm:flex-nowrap sm:gap-2.5 sm:p-2.5">
        <nav aria-label="Pilih periode" className="flex min-w-0 flex-1 items-center justify-between gap-1 sm:flex-none sm:justify-start">
          {previous ? (
            <Link href={hrefFor({ kind: "month", month: previous })} scroll={false} aria-label={`Bulan sebelumnya, ${monthLabel(previous)}`} className={ARROW_CLASSES}>
              <ChevronLeft aria-hidden className="size-5" />
            </Link>
          ) : null}
          <span aria-current="page" className="truncate px-1 text-center font-display text-[17px] font-bold text-text-primary tabular-nums sm:min-w-44">
            {periodLabel(view)}
          </span>
          {next && month && month < currentMonth ? (
            <Link href={hrefFor({ kind: "month", month: next })} scroll={false} aria-label={`Bulan berikutnya, ${monthLabel(next)}`} className={ARROW_CLASSES}>
              <ChevronRight aria-hidden className="size-5" />
            </Link>
          ) : next ? (
            <span aria-hidden className="flex size-11 shrink-0 items-center justify-center text-text-muted">
              <ChevronRight className="size-5" />
            </span>
          ) : null}
        </nav>
        <div className="hidden flex-1 sm:block" />
        <div className="flex w-full gap-2 sm:w-auto">
          {view.kind === "range" ? (
            <Link
              href={hrefFor({ kind: "month", month: to.slice(0, 7) > currentMonth ? currentMonth : to.slice(0, 7) })}
              scroll={false}
              className="flex h-10 flex-1 items-center justify-center rounded-full px-4 font-display text-sm font-bold text-accent-strong hover:text-accent-hover hover:underline focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-accent/45 sm:flex-none"
            >
              Per bulan
            </Link>
          ) : null}
          <Button variant="secondary" onClick={openDialog} className="flex-1 sm:flex-none">
            <CalendarRange aria-hidden className="size-4.25" />
            {view.kind === "range" ? "Ubah rentang" : "Pilih rentang"}
          </Button>
        </div>
      </div>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Pilih rentang tanggal"
        description={rangeHint}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Batal
            </Button>
            <Button onClick={applyRange}>Terapkan</Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField id="period-from" type="date" label="Dari" value={rangeFrom} onChange={(e) => setRangeFrom(e.target.value)} />
          <TextField id="period-to" type="date" label="Sampai" value={rangeTo} onChange={(e) => setRangeTo(e.target.value)} error={error ?? undefined} />
        </div>
      </Dialog>
    </>
  );
}

import Link from "next/link";

type Props = {
  year: number;
  // Tahun yang punya periode final (+ tahun yang dibuka), terbaru dulu
  years: number[];
};

// Pilih tahun laporan payroll (feature 32) — pill per tahun, pola filter pill daftar karyawan (izin user)
export function PayrollReportYearNav({ year, years }: Props) {
  return (
    <nav aria-label="Pilih tahun" className="flex flex-wrap gap-2">
      {years.map((item) => {
        const active = item === year;
        return (
          <Link
            key={item}
            href={`/payroll/reports?year=${item}`}
            aria-current={active ? "page" : undefined}
            className={`inline-flex h-10 items-center rounded-full px-4.5 font-display text-sm font-bold tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-accent/45 ${
              active ? "bg-inverse text-on-inverse" : "border border-border-control bg-control text-text-primary hover:border-border-control-hover hover:bg-surface-solid"
            }`}
          >
            {item}
          </Link>
        );
      })}
    </nav>
  );
}

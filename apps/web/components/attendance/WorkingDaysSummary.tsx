import { MONTH_SHORT_LABELS } from "@/lib/workCalendarLabels";

type Props = {
  // Hari kerja Jan–Des
  months: number[];
  // Index bulan berjalan (0–11) jika tahun yang ditampilkan = tahun ini
  currentMonth: number | null;
};

// Hari kerja per bulan dari jadwal + libur yang berlaku (hasil hitung API)
export function WorkingDaysSummary({ months, currentMonth }: Props) {
  const total = months.reduce((sum, value) => sum + value, 0);
  return (
    <div className="flex flex-col gap-3">
      <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
        {months.map((count, index) => {
          const current = index === currentMonth;
          return (
            <li
              key={MONTH_SHORT_LABELS[index]}
              aria-current={current ? "date" : undefined}
              className={`flex flex-col gap-1 rounded-inner px-3 py-2.5 ${current ? "bg-accent-soft" : "bg-fill-subtle"}`}
            >
              <span className={`text-caption ${current ? "font-bold text-accent-strong" : "text-text-tertiary"}`}>{MONTH_SHORT_LABELS[index]}</span>
              <span className="font-display text-xl leading-none font-extrabold text-text-primary tabular-nums">{count}</span>
            </li>
          );
        })}
      </ul>
      <p className="text-small text-text-secondary">
        Total <span className="font-bold text-text-primary tabular-nums">{total} hari kerja</span> dalam setahun.
      </p>
    </div>
  );
}

// Skeleton skor KPI (pola skeleton rekap absensi)
const ROWS = ["62%", "48%", "70%", "55%"];

export default function KpiScoresLoading() {
  return (
    <div aria-busy aria-label="Memuat skor KPI" className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 px-1.5 pt-1">
        <div className="h-8 w-40 animate-exa-pulse rounded-[10px] bg-text-primary/11" />
        <div className="h-4 w-72 animate-exa-pulse rounded-full bg-text-primary/7" />
      </div>
      <div className="glass h-15 animate-exa-pulse rounded-card" />
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.85fr)] lg:gap-4">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-1 lg:gap-4">
          {[0, 1].map((i) => (
            <div key={i} style={{ animationDelay: `${i * 0.12}s` }} className="glass-strong flex min-h-30 animate-exa-pulse flex-col gap-3 rounded-card p-5 lg:min-h-34">
              <span className="h-3 w-24 rounded-full bg-text-primary/8" />
              <span className="h-7 w-14 rounded-[10px] bg-text-primary/10" />
            </div>
          ))}
        </div>
        <div className="glass-strong flex min-h-64 animate-exa-pulse flex-col gap-5 rounded-card p-6">
          <span className="h-4 w-36 rounded-full bg-text-primary/10" />
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className="h-2.5 rounded-full bg-text-primary/7" />
          ))}
        </div>
      </div>
      <div className="glass-data overflow-hidden rounded-card">
        <div className="h-11 border-b border-border-subtle bg-table-head" />
        {ROWS.map((width, i) => (
          <div key={i} style={{ animationDelay: `${i * 0.12}s` }} className="flex h-16 animate-exa-pulse items-center gap-3 border-t border-border-subtle px-5 first:border-t-0">
            <span className="size-9 rounded-full bg-text-primary/9" />
            <span className="h-2.75 flex-1 rounded-full bg-text-primary/10" style={{ maxWidth: width }} />
          </div>
        ))}
      </div>
    </div>
  );
}

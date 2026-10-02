// Skeleton roster (design attendance-roster, tweak "Memuat"): toolbar + 5 baris karyawan × 7 sel berdenyut
const ROWS = ["55%", "40%", "62%", "48%", "35%"];
const CELLS = [0, 1, 2, 3, 4, 5, 6];

export default function AttendanceRosterLoading() {
  return (
    <div aria-busy aria-label="Memuat roster" className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 px-1.5 pt-1">
        <div className="h-8 w-40 animate-exa-pulse rounded-[10px] bg-text-primary/11" />
        <div className="h-4 w-96 max-w-full animate-exa-pulse rounded-full bg-text-primary/7" />
      </div>
      <div className="glass h-16 animate-exa-pulse rounded-card" />
      <div className="glass-data overflow-hidden rounded-card">
        <div className="h-12 border-b border-border-subtle bg-table-head" />
        {ROWS.map((width, i) => (
          <div
            key={i}
            style={{ animationDelay: `${i * 0.12}s` }}
            className="flex h-18 animate-exa-pulse items-center gap-2 border-t border-border-subtle px-4 first:border-t-0 lg:grid lg:grid-cols-[210px_repeat(7,minmax(0,1fr))_60px]"
          >
            <div className="flex flex-1 items-center gap-3">
              <span className="size-9 shrink-0 rounded-full bg-text-primary/9" />
              <span className="h-2.75 flex-1 rounded-full bg-text-primary/10" style={{ maxWidth: width }} />
            </div>
            {CELLS.map((cell) => (
              <span key={cell} className="hidden h-13 rounded-[12px] bg-text-primary/6 lg:block" />
            ))}
            <span className="h-12 w-26 shrink-0 rounded-[12px] bg-text-primary/6 lg:hidden" />
            <span className="hidden h-2.5 w-10 justify-self-end rounded-full bg-text-primary/7 lg:block" />
          </div>
        ))}
      </div>
    </div>
  );
}

// Skeleton tinjauan absensi (design attendance-review, tweak "Memuat"): panel filter + 5 baris berdenyut
const ROWS = ["55%", "40%", "62%", "48%", "35%"];

export default function AttendanceReviewLoading() {
  return (
    <div aria-busy aria-label="Memuat tinjauan absensi" className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 px-1.5 pt-1">
        <div className="h-8 w-56 animate-exa-pulse rounded-[10px] bg-text-primary/11" />
        <div className="h-4 w-96 max-w-full animate-exa-pulse rounded-full bg-text-primary/7" />
      </div>
      <div className="glass h-16 animate-exa-pulse rounded-card" />
      <div className="glass-data overflow-hidden rounded-card">
        <div className="h-11 border-b border-border-subtle bg-table-head" />
        {ROWS.map((width, i) => (
          <div key={i} style={{ animationDelay: `${i * 0.12}s` }} className="flex h-19 animate-exa-pulse items-center gap-3 border-t border-border-subtle px-5 first:border-t-0">
            <span className="size-9 shrink-0 rounded-full bg-text-primary/9" />
            <div className="flex flex-1 flex-col gap-1.75">
              <span className="h-2.75 rounded-full bg-text-primary/10" style={{ maxWidth: width }} />
              <span className="h-5 w-27.5 rounded-full bg-text-primary/7" />
            </div>
            <span className="hidden h-9 w-22.5 rounded-full bg-text-primary/7 lg:block" />
            <span className="h-9 w-21 rounded-full bg-text-primary/7 lg:w-37.5" />
          </div>
        ))}
      </div>
    </div>
  );
}

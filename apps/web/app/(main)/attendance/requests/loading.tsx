// Skeleton daftar pengajuan izin (pola skeleton daftar karyawan)
const ROWS: [string, string, string][] = [
  ["62%", "70%", "85%"],
  ["48%", "55%", "60%"],
  ["70%", "62%", "75%"],
  ["55%", "75%", "50%"],
];

export default function LeaveRequestsLoading() {
  return (
    <div aria-busy aria-label="Memuat pengajuan izin" className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 px-1.5 pt-1">
        <div className="h-8 w-52 animate-exa-pulse rounded-[10px] bg-text-primary/11" />
        <div className="h-4 w-64 animate-exa-pulse rounded-full bg-text-primary/7" />
      </div>
      <div className="h-11 w-full max-w-md animate-exa-pulse rounded-full bg-segment-track" />
      <div className="glass-data overflow-hidden rounded-card">
        <div className="h-11 border-b border-border-subtle bg-table-head" />
        {ROWS.map(([w1, w2, w3], i) => (
          <div
            key={i}
            style={{ animationDelay: `${i * 0.12}s` }}
            className="grid h-20 animate-exa-pulse grid-cols-[minmax(0,1.3fr)_minmax(0,1.1fr)_minmax(0,2fr)_minmax(0,1.3fr)] items-center gap-4 border-t border-border-subtle px-5 first:border-t-0"
          >
            <div className="flex items-center gap-3">
              <span className="size-9 rounded-full bg-text-primary/9" />
              <span className="h-2.75 flex-1 rounded-full bg-text-primary/10" style={{ maxWidth: w1 }} />
            </div>
            <span className="h-2.75 rounded-full bg-text-primary/8" style={{ width: w2 }} />
            <span className="h-2.75 rounded-full bg-text-primary/7" style={{ width: w3 }} />
            <span className="h-5.5 w-20 rounded-full bg-text-primary/7" />
          </div>
        ))}
      </div>
    </div>
  );
}

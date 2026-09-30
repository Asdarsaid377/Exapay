// Skeleton daftar karyawan (design employees "skeleton baris tabel")
const ROWS: [string, string, string][] = [
  ["62%", "70%", "80%"],
  ["48%", "55%", "60%"],
  ["70%", "62%", "0%"],
  ["55%", "75%", "70%"],
  ["40%", "50%", "50%"],
];

export default function EmployeesLoading() {
  return (
    <div aria-busy aria-label="Memuat daftar karyawan" className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 px-1.5 pt-1">
        <div className="h-8 w-40 animate-exa-pulse rounded-[10px] bg-text-primary/11" />
        <div className="h-4 w-36 animate-exa-pulse rounded-full bg-text-primary/7" />
      </div>
      <div className="glass h-16 rounded-card" />
      <div className="glass-data overflow-hidden rounded-card">
        <div className="h-11 border-b border-border-subtle bg-table-head" />
        {ROWS.map(([w1, w2, w3], i) => (
          <div
            key={i}
            style={{ animationDelay: `${i * 0.12}s` }}
            className="grid h-16 animate-exa-pulse grid-cols-[minmax(0,2fr)_minmax(0,1.6fr)_100px_minmax(0,1.2fr)] items-center gap-4 border-t border-border-subtle px-5 first:border-t-0"
          >
            <div className="flex items-center gap-3">
              <span className="size-9 rounded-full bg-text-primary/9" />
              <div className="flex flex-1 flex-col gap-1.75">
                <span className="h-2.75 rounded-full bg-text-primary/10" style={{ width: w1 }} />
                <span className="h-2.25 w-2/5 rounded-full bg-text-primary/6" />
              </div>
            </div>
            <span className="h-2.75 rounded-full bg-text-primary/8" style={{ width: w2 }} />
            <span className="h-5.5 w-16 rounded-full bg-text-primary/7" />
            <span className="h-2.75 rounded-full bg-text-primary/7" style={{ width: w3 }} />
          </div>
        ))}
      </div>
    </div>
  );
}

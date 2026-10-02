// Skeleton lokasi kerja (design settings-locations, tweak "Memuat"): kepala tabel + 2 baris berdenyut
const ROWS = ["45%", "60%"];

export default function SettingsLocationsLoading() {
  return (
    <div aria-busy aria-label="Memuat lokasi kerja" className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 px-1.5 pt-1">
        <div className="h-8 w-48 animate-exa-pulse rounded-[10px] bg-text-primary/11" />
        <div className="h-4 w-96 max-w-full animate-exa-pulse rounded-full bg-text-primary/7" />
      </div>
      <div className="glass-data overflow-hidden rounded-card">
        <div className="h-11 border-b border-border-subtle bg-table-head" />
        {ROWS.map((width, i) => (
          <div
            key={i}
            style={{ animationDelay: `${i * 0.12}s` }}
            className="grid h-19 animate-exa-pulse grid-cols-[minmax(0,2.2fr)_minmax(0,1.4fr)_120px] items-center gap-4 border-t border-border-subtle px-5 first:border-t-0 lg:grid-cols-[minmax(0,2.2fr)_minmax(0,1.4fr)_120px_140px]"
          >
            <div className="flex flex-col gap-2">
              <span className="h-3 rounded-full bg-text-primary/10" style={{ width }} />
              <span className="h-2.5 w-3/5 rounded-full bg-text-primary/7" />
            </div>
            <span className="h-2.75 w-[70%] rounded-full bg-text-primary/8" />
            <span className="h-2.75 w-12.5 rounded-full bg-text-primary/8" />
            <div className="hidden justify-end gap-2 lg:flex">
              <span className="h-9 w-17 rounded-full bg-text-primary/7" />
              <span className="size-9 rounded-full bg-text-primary/7" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

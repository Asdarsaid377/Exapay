// Skeleton /admin/billing (pola skeleton rekap absensi): judul, antrean konfirmasi, harga platform
const ROWS = ["58%", "44%", "66%"];

export default function AdminBillingLoading() {
  return (
    <div aria-busy aria-label="Memuat tagihan" className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 px-1.5 pt-1">
        <div className="h-8 w-56 animate-exa-pulse rounded-[10px] bg-text-primary/11" />
        <div className="h-4 w-72 animate-exa-pulse rounded-full bg-text-primary/7" />
      </div>
      <div className="glass-data overflow-hidden rounded-card">
        {ROWS.map((width, i) => (
          <div key={i} style={{ animationDelay: `${i * 0.12}s` }} className="flex h-20 animate-exa-pulse items-center gap-3 border-t border-border-subtle px-5 first:border-t-0">
            <span className="h-2.75 flex-1 rounded-full bg-text-primary/10" style={{ maxWidth: width }} />
          </div>
        ))}
      </div>
      <div className="glass-strong h-48 animate-exa-pulse rounded-card" />
    </div>
  );
}

// Skeleton daftar tenant (ui-rules "Loading States"): bar di permukaan kaca yang sama
export default function AdminTenantsLoading() {
  return (
    <div aria-busy aria-label="Memuat daftar tenant" className="flex flex-col gap-4 lg:gap-5">
      <div className="flex flex-col gap-2 px-1.5 pt-1">
        <div className="h-8 w-40 animate-exa-pulse rounded-[10px] bg-text-primary/11" />
        <div className="h-4 w-80 max-w-full animate-exa-pulse rounded-full bg-text-primary/7" />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="glass-strong flex min-h-30 flex-col gap-3.5 rounded-card p-5 lg:min-h-34">
            <div className="h-3 w-1/2 animate-exa-pulse rounded-full bg-text-primary/9" />
            <div className="h-6.5 w-1/3 animate-exa-pulse rounded-[10px] bg-text-primary/11" />
            <div className="h-2.5 w-2/5 animate-exa-pulse rounded-full bg-text-primary/7" />
          </div>
        ))}
      </div>
      <div className="glass-strong flex flex-col rounded-card px-5 py-2 lg:px-6">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center gap-4 border-t border-border-subtle py-4 first:border-t-0">
            <div className="flex flex-1 flex-col gap-2">
              <div className="h-3.5 w-48 max-w-full animate-exa-pulse rounded-full bg-text-primary/9" />
              <div className="h-2.5 w-32 animate-exa-pulse rounded-full bg-text-primary/7" />
            </div>
            <div className="h-6.5 w-20 animate-exa-pulse rounded-full bg-text-primary/7" />
          </div>
        ))}
      </div>
    </div>
  );
}

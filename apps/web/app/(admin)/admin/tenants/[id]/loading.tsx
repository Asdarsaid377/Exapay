// Skeleton detail tenant
export default function AdminTenantDetailLoading() {
  return (
    <div aria-busy aria-label="Memuat detail tenant" className="flex flex-col gap-4 lg:gap-5">
      <div className="flex flex-col gap-2 px-1.5 pt-1">
        <div className="h-3.5 w-28 animate-exa-pulse rounded-full bg-text-primary/7" />
        <div className="h-8 w-64 max-w-full animate-exa-pulse rounded-[10px] bg-text-primary/11" />
        <div className="h-4 w-44 animate-exa-pulse rounded-full bg-text-primary/7" />
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.85fr)_minmax(0,1fr)] lg:gap-5">
        {[5, 5].map((rows, card) => (
          <div key={card} className="glass-strong flex flex-col gap-4 rounded-card px-5 py-5 lg:px-6">
            <div className="h-4 w-28 animate-exa-pulse rounded-full bg-text-primary/9" />
            {Array.from({ length: rows }, (_, i) => (
              <div key={i} className="flex justify-between gap-4">
                <div className="h-3 w-24 animate-exa-pulse rounded-full bg-text-primary/7" />
                <div className="h-3 w-32 animate-exa-pulse rounded-full bg-text-primary/9" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

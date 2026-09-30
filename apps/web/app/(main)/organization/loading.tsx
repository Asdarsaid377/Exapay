// Skeleton organisasi (ui-rules "Loading States"): dua card daftar
export default function OrganizationLoading() {
  return (
    <div aria-busy aria-label="Memuat data organisasi" className="flex flex-col gap-4 lg:gap-5">
      <div className="flex flex-col gap-2 px-1.5 pt-1">
        <div className="h-8 w-44 animate-exa-pulse rounded-[10px] bg-text-primary/11" />
        <div className="h-4 w-96 max-w-full animate-exa-pulse rounded-full bg-text-primary/7" />
      </div>
      <div className="grid items-start gap-4 lg:grid-cols-2 lg:gap-5">
        {[0, 1].map((card) => (
          <div key={card} className="glass-strong flex flex-col rounded-card px-5 py-5 lg:px-6">
            <div className="h-4.5 w-32 animate-exa-pulse rounded-full bg-text-primary/9" />
            <div className="mt-2 mb-3 h-3 w-56 max-w-full animate-exa-pulse rounded-full bg-text-primary/7" />
            {[0, 1, 2].map((row) => (
              <div key={row} className="flex flex-col gap-2 border-t border-border-subtle py-4">
                <div className="h-3.5 w-40 animate-exa-pulse rounded-full bg-text-primary/9" />
                <div className="h-2.5 w-24 animate-exa-pulse rounded-full bg-text-primary/7" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

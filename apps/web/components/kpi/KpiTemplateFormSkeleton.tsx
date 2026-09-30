// Skeleton editor template KPI (ui-rules "Loading States"): dua FormSection di permukaan kaca yang sama
export function KpiTemplateFormSkeleton() {
  return (
    <div aria-busy aria-label="Memuat template KPI" className="flex flex-col gap-4 lg:gap-5">
      <div className="flex flex-col gap-2 px-1.5 pt-1">
        <div className="h-4 w-28 animate-exa-pulse rounded-full bg-text-primary/7" />
        <div className="h-8 w-56 animate-exa-pulse rounded-[10px] bg-text-primary/11" />
      </div>
      {[3, 4].map((rows, section) => (
        <div key={section} className="glass-strong grid gap-4 rounded-card p-4.5 lg:grid-cols-[280px_minmax(0,1fr)] lg:gap-10 lg:p-7">
          <div className="flex flex-col gap-2">
            <div className="h-4.5 w-32 animate-exa-pulse rounded-full bg-text-primary/9" />
            <div className="h-3 w-56 max-w-full animate-exa-pulse rounded-full bg-text-primary/7" />
          </div>
          <div className="flex flex-col gap-5">
            {Array.from({ length: rows }, (_, row) => (
              <div key={row} className="flex flex-col gap-2">
                <div className="h-3 w-24 animate-exa-pulse rounded-full bg-text-primary/9" />
                <div className="h-11 animate-exa-pulse rounded-field bg-text-primary/6" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

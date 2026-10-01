// Skeleton kalender kepatuhan
export default function ComplianceLoading() {
  return (
    <div aria-busy aria-label="Memuat kalender kepatuhan" className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 px-1.5 pt-1">
        <div className="h-8 w-44 animate-exa-pulse rounded-[10px] bg-text-primary/11" />
        <div className="h-4 w-96 max-w-full animate-exa-pulse rounded-full bg-text-primary/7" />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:gap-4 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="glass-strong flex min-h-30 animate-exa-pulse flex-col gap-3 rounded-card p-5 lg:min-h-34">
            <span className="h-3 w-24 rounded-full bg-text-primary/8" />
            <span className="h-7 w-12 rounded-[10px] bg-text-primary/10" />
          </div>
        ))}
      </div>
      <div className="glass h-15 animate-exa-pulse rounded-card" />
      <div className="glass-strong flex animate-exa-pulse flex-col rounded-card">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex min-h-16 items-center gap-4 border-t border-border-subtle px-5 py-3 first:border-t-0 lg:px-6">
            <span className="h-9 w-11 rounded-[10px] bg-text-primary/8" />
            <span className="flex flex-1 flex-col gap-2">
              <span className="h-3.5 w-48 max-w-full rounded-full bg-text-primary/10" />
              <span className="h-3 w-28 rounded-full bg-text-primary/7" />
            </span>
            <span className="h-6.5 w-16 rounded-full bg-text-primary/8" />
          </div>
        ))}
      </div>
    </div>
  );
}

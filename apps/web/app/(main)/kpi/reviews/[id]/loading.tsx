// Skeleton detail penilaian KPI
export default function KpiReviewDetailLoading() {
  return (
    <div aria-busy aria-label="Memuat penilaian" className="flex flex-col gap-4">
      <div className="h-5 w-32 animate-exa-pulse rounded-full bg-text-primary/8" />
      <div className="flex flex-col gap-2 px-1.5 pt-1">
        <div className="h-8 w-52 animate-exa-pulse rounded-[10px] bg-text-primary/11" />
        <div className="h-4 w-80 max-w-full animate-exa-pulse rounded-full bg-text-primary/7" />
      </div>
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.85fr)] lg:gap-4">
        <div className="flex flex-col gap-3 lg:gap-4">
          <div className="glass-strong flex min-h-30 animate-exa-pulse flex-col gap-3 rounded-card p-5 lg:min-h-34">
            <span className="h-3 w-24 rounded-full bg-text-primary/8" />
            <span className="h-7 w-14 rounded-[10px] bg-text-primary/10" />
          </div>
          <div className="glass-strong h-56 animate-exa-pulse rounded-card" />
        </div>
        <div className="glass-strong flex min-h-80 animate-exa-pulse flex-col gap-5 rounded-card p-6">
          <span className="h-4 w-36 rounded-full bg-text-primary/10" />
          {[0, 1, 2].map((i) => (
            <span key={i} className="h-2.5 rounded-full bg-text-primary/7" />
          ))}
        </div>
      </div>
    </div>
  );
}

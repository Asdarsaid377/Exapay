// Skeleton siklus KPI (pola skeleton pengaturan)
export default function SettingsKpiLoading() {
  return (
    <div aria-busy aria-label="Memuat siklus KPI" className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 px-1.5 pt-1">
        <div className="h-8 w-36 animate-exa-pulse rounded-[10px] bg-text-primary/11" />
        <div className="h-4 w-80 max-w-full animate-exa-pulse rounded-full bg-text-primary/7" />
      </div>
      <div className="glass-strong grid animate-exa-pulse gap-4 rounded-card p-4.5 lg:grid-cols-[280px_minmax(0,1fr)] lg:gap-10 lg:p-7">
        <div className="flex flex-col gap-2.5">
          <span className="h-4 w-36 rounded-full bg-text-primary/10" />
          <span className="h-3 w-full rounded-full bg-text-primary/7" />
          <span className="h-3 w-3/4 rounded-full bg-text-primary/7" />
        </div>
        <div className="flex flex-col gap-4">
          <span className="h-12 rounded-full bg-text-primary/8" />
          <span className="h-3 w-2/3 rounded-full bg-text-primary/7" />
          <span className="mt-6 h-10 w-36 self-end rounded-full bg-text-primary/9" />
        </div>
      </div>
    </div>
  );
}

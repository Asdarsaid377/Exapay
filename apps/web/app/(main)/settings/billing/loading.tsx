// Skeleton halaman langganan (ui-rules "Loading States"): bar di permukaan kaca yang sama
export default function SettingsBillingLoading() {
  return (
    <div aria-busy aria-label="Memuat langganan" className="flex flex-col gap-4 lg:gap-5">
      <div className="flex flex-col gap-2 px-1.5 pt-1">
        <div className="h-8 w-40 animate-exa-pulse rounded-[10px] bg-text-primary/11" />
        <div className="h-4 w-80 max-w-full animate-exa-pulse rounded-full bg-text-primary/7" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:gap-4 xl:grid-cols-3">
        {[0, 1, 2].map((tile) => (
          <div key={tile} className={`glass-strong flex min-h-30 flex-col gap-4 rounded-card p-5 lg:min-h-34 ${tile === 2 ? "sm:col-span-2 xl:col-span-1" : ""}`}>
            <div className="h-3.5 w-28 animate-exa-pulse rounded-full bg-text-primary/9" />
            <div className="h-8 w-24 animate-exa-pulse rounded-[10px] bg-text-primary/11" />
            <div className="h-3 w-40 max-w-full animate-exa-pulse rounded-full bg-text-primary/7" />
          </div>
        ))}
      </div>
      <div className="glass-strong grid gap-5 rounded-card p-5 lg:grid-cols-[280px_minmax(0,1fr)] lg:gap-10 lg:p-7">
        <div className="flex flex-col gap-2">
          <div className="h-4.5 w-36 animate-exa-pulse rounded-full bg-text-primary/9" />
          <div className="h-3 w-56 max-w-full animate-exa-pulse rounded-full bg-text-primary/7" />
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          {[0, 1, 2, 3].map((field) => (
            <div key={field} className="flex flex-col gap-2">
              <div className="h-3 w-28 animate-exa-pulse rounded-full bg-text-primary/9" />
              <div className="h-5 w-24 animate-exa-pulse rounded-full bg-text-primary/7" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Skeleton profil usaha (ui-rules "Loading States"): bar di permukaan kaca yang sama
export default function SettingsCompanyLoading() {
  return (
    <div aria-busy aria-label="Memuat profil usaha" className="flex flex-col gap-4 lg:gap-5">
      <div className="flex flex-col gap-2 px-1.5 pt-1">
        <div className="h-8 w-48 animate-exa-pulse rounded-[10px] bg-text-primary/11" />
        <div className="h-4 w-80 max-w-full animate-exa-pulse rounded-full bg-text-primary/7" />
      </div>
      <div className="glass-strong flex flex-col gap-6 rounded-card p-5 lg:p-7">
        {[0, 1].map((section) => (
          <div key={section} className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:gap-8">
            <div className="flex flex-col gap-2">
              <div className="h-4.5 w-36 animate-exa-pulse rounded-full bg-text-primary/9" />
              <div className="h-3 w-56 max-w-full animate-exa-pulse rounded-full bg-text-primary/7" />
            </div>
            <div className="flex flex-col gap-4">
              {[0, 1, 2].map((field) => (
                <div key={field} className="flex flex-col gap-2">
                  <div className="h-3 w-24 animate-exa-pulse rounded-full bg-text-primary/9" />
                  <div className="h-11 animate-exa-pulse rounded-field bg-text-primary/6" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

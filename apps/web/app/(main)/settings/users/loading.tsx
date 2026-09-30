// Skeleton daftar pengguna (ui-rules "Loading States"): bar di permukaan kaca yang sama
export default function SettingsUsersLoading() {
  return (
    <div aria-busy aria-label="Memuat daftar pengguna" className="flex flex-col gap-4 lg:gap-5">
      <div className="flex flex-col gap-2 px-1.5 pt-1">
        <div className="h-8 w-40 animate-exa-pulse rounded-[10px] bg-text-primary/11" />
        <div className="h-4 w-80 max-w-full animate-exa-pulse rounded-full bg-text-primary/7" />
      </div>
      <div className="glass-strong flex flex-col rounded-card px-5 py-2 lg:px-6">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center gap-3 border-t border-border-subtle py-4 first:border-t-0">
            <div className="size-10 shrink-0 animate-exa-pulse rounded-full bg-text-primary/9" />
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

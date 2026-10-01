// Skeleton komponen gaji (ui-rules "Loading States"): card daftar + section kaca dengan bar di permukaan yang sama
export default function SettingsSalaryComponentsLoading() {
  return (
    <div aria-busy aria-label="Memuat komponen gaji" className="flex flex-col gap-4 lg:gap-5">
      <div className="flex flex-col gap-2 px-1.5 pt-1">
        <div className="h-8 w-52 animate-exa-pulse rounded-[10px] bg-text-primary/11" />
        <div className="h-4 w-96 max-w-full animate-exa-pulse rounded-full bg-text-primary/7" />
      </div>
      <div className="glass-strong flex flex-col rounded-card">
        <div className="flex flex-col gap-2 px-5 pt-5 pb-3 lg:px-6">
          <div className="h-4.5 w-40 animate-exa-pulse rounded-full bg-text-primary/9" />
          <div className="h-3 w-80 max-w-full animate-exa-pulse rounded-full bg-text-primary/7" />
        </div>
        {Array.from({ length: 8 }, (_, row) => (
          <div key={row} className="flex min-h-15 flex-col justify-center gap-1.5 border-t border-border-subtle px-5 py-2.5 lg:px-6">
            <div className="h-4 w-40 animate-exa-pulse rounded-full bg-text-primary/9" />
            <div className="h-3 w-56 max-w-full animate-exa-pulse rounded-full bg-text-primary/7" />
          </div>
        ))}
      </div>
    </div>
  );
}

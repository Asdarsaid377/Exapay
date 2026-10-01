// Skeleton slip gaji periode
export default function PayslipsLoading() {
  return (
    <div aria-busy aria-label="Memuat slip gaji" className="flex flex-col gap-4">
      <div className="h-5 w-28 animate-exa-pulse rounded-full bg-text-primary/8" />
      <div className="flex flex-col gap-2 px-1.5 pt-1">
        <div className="h-8 w-56 animate-exa-pulse rounded-[10px] bg-text-primary/11" />
        <div className="h-4 w-72 max-w-full animate-exa-pulse rounded-full bg-text-primary/7" />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:gap-4 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="glass-strong flex min-h-30 animate-exa-pulse flex-col gap-3 rounded-card p-5 lg:min-h-34">
            <span className="h-3 w-24 rounded-full bg-text-primary/8" />
            <span className="h-7 w-32 rounded-[10px] bg-text-primary/10" />
          </div>
        ))}
      </div>
      <div className="glass-data h-72 animate-exa-pulse rounded-card" />
    </div>
  );
}

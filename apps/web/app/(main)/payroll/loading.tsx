// Skeleton daftar periode gaji
export default function PayrollRunsLoading() {
  return (
    <div aria-busy aria-label="Memuat periode gaji" className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 px-1.5 pt-1">
        <div className="h-8 w-44 animate-exa-pulse rounded-[10px] bg-text-primary/11" />
        <div className="h-4 w-96 max-w-full animate-exa-pulse rounded-full bg-text-primary/7" />
      </div>
      <div className="glass-data flex flex-col rounded-card">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex h-16 items-center gap-4 border-t border-border-subtle px-5 first:border-t-0">
            <span className="h-4 w-40 animate-exa-pulse rounded-full bg-text-primary/10" />
          </div>
        ))}
      </div>
    </div>
  );
}

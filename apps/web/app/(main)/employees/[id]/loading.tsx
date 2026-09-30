// Skeleton detail karyawan: header + tab + dua section
export default function EmployeeDetailLoading() {
  return (
    <div aria-busy aria-label="Memuat data karyawan" className="flex flex-col gap-4 lg:gap-5">
      <div className="flex items-center gap-4 px-1.5 pt-9">
        <span className="size-14 animate-exa-pulse rounded-full bg-text-primary/9 lg:size-17" />
        <div className="flex flex-col gap-2">
          <div className="h-7 w-52 animate-exa-pulse rounded-[10px] bg-text-primary/11" />
          <div className="h-4 w-64 max-w-full animate-exa-pulse rounded-full bg-text-primary/7" />
        </div>
      </div>
      <div className="h-11.5 border-b border-text-primary/10" />
      {[0, 1].map((card) => (
        <div key={card} className="glass-strong grid gap-4 rounded-card p-4.5 lg:grid-cols-[280px_minmax(0,1fr)] lg:gap-10 lg:p-7">
          <div className="h-4.5 w-32 animate-exa-pulse rounded-full bg-text-primary/9" />
          <div className="grid gap-5.5 sm:grid-cols-2">
            {[0, 1, 2, 3].map((field) => (
              <div key={field} className="flex flex-col gap-2">
                <div className="h-3 w-24 animate-exa-pulse rounded-full bg-text-primary/7" />
                <div className="h-4 w-40 animate-exa-pulse rounded-full bg-text-primary/9" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

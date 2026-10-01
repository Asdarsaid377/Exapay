// Skeleton dashboard (snapshot dashboard.html "State · skeleton loading"): stat tile + card daftar berdenyut
export default function DashboardLoading() {
  return (
    <div aria-busy aria-label="Memuat dashboard" className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 px-1.5 pt-1">
        <div className="h-8 w-56 animate-exa-pulse rounded-[10px] bg-text-primary/11" />
        <div className="h-4 w-96 max-w-full animate-exa-pulse rounded-full bg-text-primary/7" />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:gap-4 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={`glass-strong flex min-h-30 animate-exa-pulse flex-col gap-3.5 rounded-card p-5 lg:min-h-34 ${i === 0 || i === 3 ? "max-xl:col-span-2" : ""}`}>
            <span className="h-3 w-1/2 rounded-full bg-text-primary/9" />
            <span className="h-6.5 w-3/4 rounded-[10px] bg-text-primary/11" />
            <span className="h-2.5 w-2/5 rounded-full bg-text-primary/7" />
          </div>
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        {[0, 1].map((card) => (
          <div key={card} className="glass-strong flex animate-exa-pulse flex-col gap-4.5 rounded-card px-6 py-5.5">
            <span className="h-3.5 w-2/5 rounded-full bg-text-primary/10" />
            {[0, 1].map((row) => (
              <div key={row} className="flex items-center gap-4">
                <span className="flex flex-1 flex-col gap-2">
                  <span className="h-3 w-3/4 rounded-full bg-text-primary/9" />
                  <span className="h-2.5 w-2/5 rounded-full bg-text-primary/6" />
                </span>
                <span className="h-10 w-24 rounded-full bg-text-primary/8" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

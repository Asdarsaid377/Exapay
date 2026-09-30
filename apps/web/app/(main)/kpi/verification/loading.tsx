// Skeleton verifikasi tugas (pola skeleton pengajuan izin): kelompok karyawan + tanggal berisi baris catatan
const GROUPS: [string, number][] = [
  ["58%", 3],
  ["46%", 2],
];

export default function TaskVerificationLoading() {
  return (
    <div aria-busy aria-label="Memuat catatan tugas" className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 px-1.5 pt-1">
        <div className="h-8 w-56 animate-exa-pulse rounded-[10px] bg-text-primary/11" />
        <div className="h-4 w-72 animate-exa-pulse rounded-full bg-text-primary/7" />
      </div>
      <div className="h-11 w-full max-w-md animate-exa-pulse rounded-full bg-segment-track" />
      {GROUPS.map(([width, rows], g) => (
        <div key={g} className="glass-data overflow-hidden rounded-card" style={{ animationDelay: `${g * 0.12}s` }}>
          <div className="flex animate-exa-pulse items-center gap-3 px-4.5 pt-4 pb-3.5 lg:px-6">
            <span className="size-10 rounded-full bg-text-primary/9" />
            <span className="h-2.75 flex-1 rounded-full bg-text-primary/10" style={{ maxWidth: width }} />
          </div>
          {Array.from({ length: rows }, (_, i) => (
            <div key={i} className="flex animate-exa-pulse items-center gap-3 border-t border-border-subtle px-4.5 py-4 lg:px-6">
              <span className="h-3 w-10 rounded-full bg-text-primary/9" />
              <span className="h-2.75 flex-1 rounded-full bg-text-primary/7" style={{ maxWidth: `${60 - i * 12}%` }} />
              <span className="hidden h-10 w-56 rounded-field bg-text-primary/6 lg:block" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

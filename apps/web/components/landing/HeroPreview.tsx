import { Circle, CircleCheck, House, ListChecks, LogIn, type LucideIcon, Receipt, CalendarCheck } from "lucide-react";

const ROWS = [
  { name: "Dimas Pratama", role: "Kepala barista · tetap", net: "Rp 6.799.097" },
  { name: "Rina Wulandari", role: "Kasir · kontrak", net: "Rp 3.952.400" },
  { name: "Agus Pratama", role: "Barista · percobaan", net: "Rp 3.610.000" },
] as const;

const TASKS = [
  { label: "Cek stok biji kopi", meta: "Selesai", done: true },
  { label: "Bersihkan mesin espresso", meta: "", done: false },
  { label: "Jual menu baru", meta: "0/40 cup", done: false },
] as const;

const TABS: { label: string; icon: LucideIcon; active: boolean }[] = [
  { label: "Beranda", icon: House, active: true },
  { label: "Tugas", icon: ListChecks, active: false },
  { label: "Absensi", icon: CalendarCheck, active: false },
  { label: "Slip", icon: Receipt, active: false },
];

// Cuplikan UI di hero (snapshot landing.html): kartu payroll draf + portal karyawan dalam bingkai HP. Ilustrasi data
// contoh — dibaca pembaca layar sebagai satu gambar.
export function HeroPreview() {
  return (
    <div role="img" aria-label="Contoh tampilan Exapay: draf payroll Oktober 2026 dan portal karyawan di HP" className="relative mt-2 h-105 animate-exa-rise [animation-delay:300ms] lg:mt-0 lg:h-145">
      <div className="glass-strong absolute top-0 right-10 left-0 flex flex-col gap-3 rounded-card p-4.5 lg:top-5 lg:right-auto lg:w-92 lg:gap-4.5 lg:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-0.75">
            <span className="font-display text-[14.5px] font-bold lg:text-base">Payroll Oktober 2026</span>
            <span className="hidden text-[13px] text-text-secondary lg:block">Kopi Nusantara · 1–31 Okt 2026</span>
          </div>
          <span className="inline-flex h-5.5 items-center rounded-full bg-warning-soft px-2.25 text-xs font-bold text-warning-text lg:h-6 lg:px-2.5 lg:text-[12.5px]">
            Draf
          </span>
        </div>
        <div className="flex flex-col gap-1 rounded-inner bg-surface-solid px-3.5 py-3 lg:gap-1.5 lg:p-4">
          <span className="text-[12.5px] text-text-secondary lg:text-[13.5px]">
            Total gaji bersih<span className="lg:hidden"> · 15 karyawan</span>
          </span>
          <div className="flex items-baseline gap-1.5">
            <span className="font-display text-[28px] leading-[1.05] font-extrabold tracking-[-0.02em] tabular-nums lg:hidden">Rp 48.215.400</span>
            <span className="hidden font-display text-lg font-bold lg:inline">Rp</span>
            <span className="hidden font-display text-[38px] leading-none font-extrabold tracking-[-0.02em] tabular-nums lg:inline">48.215.400</span>
          </div>
          <span className="hidden text-[13px] text-text-tertiary lg:block">15 karyawan · slip siap dikirim setelah final</span>
        </div>
        <div className="flex flex-col gap-1.5 lg:gap-0">
          {ROWS.map((row) => (
            <div key={row.name} className="flex items-center justify-between gap-3 text-[13px] lg:border-t lg:border-border-subtle lg:py-2.5 lg:first:border-t-0">
              <div className="flex flex-col gap-px">
                <span className="lg:text-sm lg:font-bold">{row.name}</span>
                <span className="hidden text-[12.5px] text-text-secondary lg:block">{row.role}</span>
              </div>
              <span className="font-bold tabular-nums lg:text-sm">{row.net}</span>
            </div>
          ))}
        </div>
        <div className="hidden gap-2 lg:flex">
          <span className="flex h-10 items-center rounded-full bg-accent px-4.5 font-display text-sm font-bold text-on-accent">Review draf</span>
          <span className="flex h-10 items-center rounded-full border border-border-control bg-control px-4.5 font-display text-sm font-bold">Ekspor Excel</span>
        </div>
      </div>

      {/* Portal karyawan — mobile: ringkas */}
      <div className="absolute right-0 bottom-0 w-52.5 animate-exa-float rounded-[30px] bg-inverse p-1.5 shadow-drawer lg:hidden">
        <div className="flex flex-col gap-2.5 rounded-[24px] bg-background p-3.5">
          <div className="flex flex-col">
            <span className="font-display text-[15px] font-extrabold">Selamat pagi, Rina</span>
            <span className="text-[11.5px] text-text-secondary">Jumat, 2 Okt 2026</span>
          </div>
          <span className="font-display text-[26px] leading-none font-extrabold tabular-nums">07.56</span>
          <span className="flex h-10 items-center justify-center rounded-full bg-accent font-display text-[13px] font-bold text-on-accent">Absen masuk</span>
          <span className="text-[11.5px] text-text-secondary">3 tugas hari ini · 1 selesai</span>
        </div>
      </div>

      {/* Portal karyawan — desktop: bingkai HP lengkap */}
      <div className="absolute top-21 right-0 hidden h-124 w-59 animate-exa-float rounded-device bg-inverse p-2 shadow-drawer lg:block">
        <div className="relative flex h-full flex-col overflow-hidden rounded-[32px] bg-background">
          <div aria-hidden className="absolute -top-22.5 -right-20 size-55 rounded-full bg-shape-peach" />
          <div className="relative flex min-h-0 flex-1 flex-col gap-2 overflow-hidden px-3 pt-3">
            <div className="flex justify-between text-[11.5px] font-bold">
              <span>07.56</span>
              <span className="h-3 w-11.5 rounded-full bg-inverse" />
              <span>100%</span>
            </div>
            <div className="flex flex-col gap-px px-0.5">
              <span className="font-display text-[17px] font-extrabold tracking-[-0.02em]">Selamat pagi, Rina</span>
              <span className="text-xs text-text-secondary">Jumat, 2 Okt 2026</span>
            </div>
            <div className="surface-solid flex flex-col gap-2.5 rounded-[18px] p-3.5">
              <span className="text-xs text-text-secondary">Shift pagi · 08.00–16.00</span>
              <span className="font-display text-[30px] leading-none font-extrabold tracking-[-0.02em] tabular-nums">07.56</span>
              <span className="flex h-11 items-center justify-center gap-2 rounded-full bg-accent font-display text-sm font-bold text-on-accent">
                <LogIn aria-hidden className="size-4" />
                Absen masuk
              </span>
            </div>
            <div className="surface-solid flex flex-col rounded-[18px] px-3.5 pt-3 pb-1">
              <span className="pb-1 font-display text-[13px] font-bold">Tugas hari ini</span>
              {TASKS.map((task) => (
                <div key={task.label} className="flex items-center gap-2 border-t border-border-subtle py-2">
                  {task.done ? <CircleCheck aria-hidden className="size-3.75 shrink-0 text-success" /> : <Circle aria-hidden className="size-3.75 shrink-0 text-text-muted" />}
                  <span className="flex-1 text-xs leading-[1.3]">{task.label}</span>
                  <span className="text-[11.5px] font-bold text-text-secondary">{task.meta}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="relative grid grid-cols-4 border-t border-border-subtle bg-surface-glass-overlay px-1.5 pt-2 pb-3">
            {TABS.map((tab) => (
              <div key={tab.label} className={`flex flex-col items-center gap-0.75 ${tab.active ? "text-accent-strong" : "text-text-secondary"}`}>
                <tab.icon aria-hidden className="size-4.5" />
                <span className="text-[10px] font-bold">{tab.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

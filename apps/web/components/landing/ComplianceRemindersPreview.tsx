import { Badge, type BadgeTone } from "@/components/common/Badge";

const REMINDERS: { day: string; month: string; title: string; sub: string; due: string; tone: BadgeTone }[] = [
  { day: "5", month: "Okt", title: "Masa percobaan Agus Pratama selesai", sub: "Barista · mulai 5 Jul 2026", due: "H-3", tone: "danger" },
  { day: "10", month: "Okt", title: "Setor iuran BPJS", sub: "Kesehatan & Ketenagakerjaan · Sep 2026", due: "H-8", tone: "warning" },
  { day: "12", month: "Okt", title: "Kontrak Rina Wulandari habis", sub: "Kasir · kontrak 12 bulan", due: "H-10", tone: "neutral" },
  { day: "15", month: "Okt", title: "Setor PPh 21", sub: "Masa pajak September 2026", due: "H-13", tone: "neutral" },
];

// Cuplikan daftar pengingat kepatuhan bertanggal (blok fitur Kepatuhan)
export function ComplianceRemindersPreview() {
  return (
    <div role="img" aria-label="Contoh daftar pengingat kepatuhan: masa percobaan, setor BPJS, kontrak habis, setor PPh 21" className="surface-solid flex flex-col rounded-[20px] px-4 py-1.5 lg:rounded-card lg:px-6.5 lg:pt-5.5 lg:pb-2">
      <span className="hidden pb-2 font-display text-base font-bold lg:block">Pengingat kepatuhan</span>
      {REMINDERS.map((reminder) => (
        <div key={reminder.title} className="flex items-center gap-3 border-t border-border-subtle py-2.75 first-of-type:border-t-0 lg:gap-4 lg:py-3.25 lg:first-of-type:border-t">
          <div className="flex w-8.5 shrink-0 flex-col items-center lg:w-11">
            <span className="font-display text-[17px] leading-[1.1] font-extrabold lg:text-xl">{reminder.day}</span>
            <span className="text-[11.5px] text-text-tertiary lg:text-xs">{reminder.month}</span>
          </div>
          <div className="flex flex-1 flex-col gap-0.5">
            <span className="text-[13px] leading-[1.35] font-bold lg:text-[14.5px]">{reminder.title}</span>
            <span className="hidden text-[13px] text-text-secondary lg:block">{reminder.sub}</span>
          </div>
          <Badge tone={reminder.tone}>{reminder.due}</Badge>
        </div>
      ))}
    </div>
  );
}

import { Badge } from "@/components/common/Badge";

const PROGRAMS = [
  { name: "BPJS Kesehatan", joined: true },
  { name: "JHT — Jaminan Hari Tua", joined: true },
  { name: "JP — Jaminan Pensiun", joined: false },
  { name: "JKK — Kecelakaan Kerja", joined: true },
  { name: "JKM — Kematian", joined: true },
] as const;

// Cuplikan kepesertaan BPJS per karyawan (section "Mulai dari kondisi usaha Anda") — data contoh, sebagian belum ikut
export function BpjsParticipationPreview() {
  return (
    <div role="img" aria-label="Contoh pengaturan kepesertaan BPJS per karyawan, sebagian program belum diikuti" className="flex justify-center">
      <div className="surface-solid flex w-full max-w-95 flex-col rounded-card px-5.5 pt-5.5 pb-2.5">
        <div className="flex flex-col gap-0.5 pb-2.5">
          <span className="font-display text-[15px] font-bold">Kepesertaan BPJS · Agus Pratama</span>
          <span className="text-[13px] text-text-secondary">Barista · berlaku mulai 1 Okt 2026</span>
        </div>
        {PROGRAMS.map((program) => (
          <div key={program.name} className="flex min-h-12 items-center justify-between gap-3 border-t border-border-subtle">
            <span className="text-[14.5px]">{program.name}</span>
            <Badge tone={program.joined ? "success" : "outline"}>{program.joined ? "Ikut" : "Belum ikut"}</Badge>
          </div>
        ))}
      </div>
    </div>
  );
}

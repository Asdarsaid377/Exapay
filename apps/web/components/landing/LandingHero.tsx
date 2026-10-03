import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { buttonClassName } from "@/components/common/Button";
import { HeroPreview } from "@/components/landing/HeroPreview";

type Props = {
  ctaLabel: string;
};

// Hero landing page (snapshot landing.html) + kalimat revisi untuk UMKM yang belum menjalankan semua regulasi
export function LandingHero({ ctaLabel }: Props) {
  return (
    <section className="grid items-center gap-14 pt-11 pb-16 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] lg:pt-22 lg:pb-30">
      <div className="flex flex-col gap-5.5 px-1 lg:gap-7 lg:px-0">
        <h1 className="animate-exa-rise text-balance font-display text-hero-sm font-extrabold lg:text-hero">Gaji, absensi, dan kinerja karyawan beres tanpa Excel.</h1>
        <div className="flex max-w-135 animate-exa-rise flex-col gap-3 [animation-delay:110ms]">
          <p className="text-[17px] leading-[1.55] text-pretty text-text-secondary lg:text-lead">
            Exapay menghitung gaji lengkap dengan BPJS dan PPh 21 TER, mencatat absensi dari HP karyawan, dan mengubah tugas harian jadi skor kinerja yang
            bisa dijelaskan. Untuk UMKM yang belum punya HRD.
          </p>
          <p className="text-[15px] leading-normal text-pretty text-text-primary lg:text-base">
            Dibuat untuk usaha kecil, bukan hanya perusahaan besar — mulai dari 1 karyawan. Belum semua karyawan ikut BPJS? Tetap bisa mulai dari
            kondisi usaha Anda sekarang.
          </p>
        </div>
        <div className="flex animate-exa-rise flex-col gap-2.5 [animation-delay:220ms] lg:gap-3.5">
          <div className="flex flex-col gap-2.5 lg:flex-row lg:gap-3">
            <Link href="/signup" className={buttonClassName({ className: "group h-13 px-7 text-base lg:h-13.5" })}>
              {ctaLabel}
              <ArrowRight aria-hidden className="size-4.5 transition-transform duration-300 ease-exa-out group-hover:translate-x-1" />
            </Link>
            <a href="#harga" className={buttonClassName({ variant: "secondary", className: "h-13 px-6.5 text-base lg:h-13.5" })}>
              Lihat harga
            </a>
          </div>
          <span className="text-center text-[13.5px] text-text-secondary lg:text-left lg:text-sm">Tanpa kartu kredit · Data tetap milik Anda</span>
        </div>
      </div>
      <HeroPreview />
    </section>
  );
}

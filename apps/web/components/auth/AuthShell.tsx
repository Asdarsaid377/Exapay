import Image from "next/image";
import type { ReactNode } from "react";

import { AuthHeading } from "@/components/auth/AuthHeading";
import { ExapayLogo } from "@/components/auth/ExapayLogo";
import { BackdropShapes } from "@/components/layout/BackdropShapes";
import authTeamPhoto from "@/public/images/auth-team.jpg";

type Props = {
  // Kosongkan jika form merender AuthHeading sendiri (judul berubah per langkah)
  title?: string;
  description?: string;
  children: ReactNode;
  // Tautan di bawah card (mis. "Kembali ke halaman masuk")
  footer?: ReactNode;
};

// Teks saja — tanpa chip ikon/dot dekoratif (preferensi user, lihat ui-rules "Gaya yang Ditolak User")
const HIGHLIGHTS = [
  { title: "Gaji, BPJS & PPh 21 dihitung otomatis", text: "Mengikuti aturan terbaru, lengkap dengan rinciannya." },
  { title: "Absensi dari HP", text: "Potongan keterlambatan dan alpa konsisten serta bisa dijelaskan." },
  { title: "Kinerja yang terukur", text: "Tugas harian menjadi skor KPI yang adil untuk setiap karyawan." },
  { title: "Pengingat kepatuhan", text: "Tidak lagi terlambat setor BPJS, lapor pajak, atau perpanjang kontrak." },
];

// Kerangka halaman auth: panel foto mengambang di kiri (desktop), card kaca form di atas bentuk latar di kanan.
// Diturunkan dari pola snapshot glassmorphism (belum ada desain khusus halaman auth).
export function AuthShell({ title, description, children, footer }: Props) {
  return (
    <>
      <BackdropShapes variant="auth" />
      <div className="grid min-h-dvh lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-5 lg:p-5">
        <aside className="relative hidden overflow-hidden rounded-sheet bg-inverse p-12 lg:flex lg:flex-col lg:justify-between">
          {/* Foto latar (Unsplash, bebas pakai) + lapisan gelap rata agar teks terbaca — tanpa gradient */}
          <Image src={authTeamPhoto} alt="" fill priority placeholder="blur" sizes="(min-width: 1024px) 46vw, 0px" className="object-cover" />
          <div aria-hidden className="absolute inset-0 bg-inverse/60" />

          <div className="relative">
            <ExapayLogo tone="inverse" />
          </div>

          <div className="relative mt-auto mb-10 flex max-w-xl flex-col gap-8">
            <h2 className="font-display text-4xl leading-tight font-extrabold tracking-[-0.025em] text-on-inverse">
              Urusan karyawan beres, Anda <span className="text-accent">fokus mengembangkan usaha.</span>
            </h2>
            <ul className="grid grid-cols-2 gap-x-6 gap-y-5">
              {HIGHLIGHTS.map(({ title: itemTitle, text }) => (
                <li key={itemTitle} className="flex flex-col gap-1 border-t border-on-inverse/20 pt-3">
                  <p className="text-[15px] font-bold text-on-inverse">{itemTitle}</p>
                  <p className="text-small text-on-inverse/75">{text}</p>
                </li>
              ))}
            </ul>
          </div>

          <div className="relative flex items-center justify-between text-caption text-on-inverse/70">
            <p>© {new Date().getFullYear()} Exapay</p>
            <p>
              Foto:{" "}
              <a
                href="https://unsplash.com/photos/lLrZy195sIU"
                target="_blank"
                rel="noreferrer"
                className="underline-offset-4 hover:text-on-inverse hover:underline"
              >
                ThisisEngineering / Unsplash
              </a>
            </p>
          </div>
        </aside>

        <main className="flex flex-col items-center justify-center px-3.5 py-10 sm:px-8">
          <div className="flex w-full max-w-md flex-col gap-6">
            <div className="px-1 lg:hidden">
              <ExapayLogo />
            </div>
            <section className="glass-strong flex flex-col gap-6 rounded-card p-6 sm:p-8">
              {title ? <AuthHeading title={title} description={description} /> : null}
              {children}
            </section>
            {footer ? <div className="text-center text-sm text-text-secondary">{footer}</div> : null}
          </div>
        </main>
      </div>
    </>
  );
}

import Link from "next/link";

import { ExapayLogo } from "@/components/auth/ExapayLogo";
import { LANDING_CONTACT } from "@/lib/landingContent";

const COLUMNS = [
  {
    title: "Produk",
    links: [
      { label: "Fitur", href: "#fitur" },
      { label: "Harga", href: "#harga" },
      { label: "FAQ", href: "#faq" },
      { label: "Masuk", href: "/login" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Kebijakan privasi", href: "/privasi" },
      { label: "Syarat layanan", href: "/syarat" },
    ],
  },
  {
    title: "Kontak",
    links: [
      { label: LANDING_CONTACT.email, href: `mailto:${LANDING_CONTACT.email}` },
      { label: `WhatsApp ${LANDING_CONTACT.whatsappLabel}`, href: LANDING_CONTACT.whatsappHref },
    ],
  },
] as const;

export function LandingFooter() {
  return (
    <footer className="flex flex-col gap-7 border-t border-text-primary/10 px-1 py-8 lg:gap-12 lg:px-0 lg:pt-12 lg:pb-10">
      <div className="grid gap-7 lg:grid-cols-[minmax(0,1.6fr)_repeat(3,minmax(0,1fr))] lg:gap-10">
        <div className="flex flex-col gap-2.5 lg:gap-3.5">
          <ExapayLogo />
          <p className="max-w-85 text-sm leading-[1.55] text-text-secondary lg:text-[15px]">
            Membantu tugas HRD di usaha kecil Indonesia: gaji, absensi, dan kinerja karyawan dalam satu tempat.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-6 lg:contents">
          {COLUMNS.map((column) => (
            <nav key={column.title} aria-label={column.title} className="flex flex-col gap-1 lg:gap-3">
              <span className="pb-1 font-display text-[13.5px] font-bold lg:pb-0 lg:text-sm">{column.title}</span>
              {column.links.map((link) =>
                link.href.startsWith("/") ? (
                  <Link key={link.href} href={link.href} className="flex min-h-9 items-center text-sm text-text-secondary hover:text-accent-strong lg:min-h-0 lg:text-[15px]">
                    {link.label}
                  </Link>
                ) : (
                  <a key={link.href} href={link.href} className="flex min-h-9 items-center text-sm break-all text-text-secondary hover:text-accent-strong lg:min-h-0 lg:text-[15px]">
                    {link.label}
                  </a>
                ),
              )}
            </nav>
          ))}
        </div>
      </div>
      <span className="text-[13px] text-text-tertiary lg:text-sm">© 2026 Exapay</span>
    </footer>
  );
}

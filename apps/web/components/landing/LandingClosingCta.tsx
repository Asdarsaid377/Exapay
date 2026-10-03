import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { buttonClassName } from "@/components/common/Button";
import { LANDING_CONTACT } from "@/lib/landingContent";

type Props = {
  trialDays: number | null;
  ctaLabel: string;
};

// CTA penutup: panel kaca besar, tanpa gradient
export function LandingClosingCta({ trialDays, ctaLabel }: Props) {
  return (
    <section className="pb-14 lg:pb-24">
      <div className="glass-strong exa-reveal flex flex-col items-center gap-4 rounded-[26px] px-5.5 py-10 text-center lg:gap-5 lg:rounded-sheet lg:px-12 lg:py-18">
        <h2 className="text-balance font-display text-section-sm leading-[1.12] font-extrabold lg:text-[52px] lg:leading-[1.08] lg:tracking-[-0.035em]">
          {trialDays && trialDays > 0 ? `Coba Exapay gratis ${trialDays} hari` : "Coba Exapay gratis"}
        </h2>
        <p className="max-w-140 text-[15.5px] leading-[1.55] text-pretty text-neutral-text lg:text-lg">
          Masukkan data usaha dan karyawan, lalu lihat draf gaji bulan ini dihitung untuk Anda.
        </p>
        <Link href="/signup" data-umami-event="cta-closing" className={buttonClassName({ className: "group mt-0 h-13 w-full px-8 text-base lg:mt-2 lg:h-14 lg:w-auto lg:text-[17px]" })}>
          {ctaLabel}
          <ArrowRight aria-hidden className="hidden size-4.5 transition-transform duration-300 ease-exa-out group-hover:translate-x-1 lg:block" />
        </Link>
        <span className="text-[13px] text-text-secondary lg:text-sm">Tanpa kartu kredit · Data tetap milik Anda</span>
        <p className="text-sm text-text-secondary lg:text-[15px]">
          Masih ragu?{" "}
          <a
            href={LANDING_CONTACT.whatsappHref}
            target="_blank"
            rel="noopener noreferrer"
            data-umami-event="whatsapp-closing"
            className="font-bold text-accent-strong hover:text-accent-hover hover:underline"
          >
            Tanya lewat WhatsApp
          </a>
        </p>
      </div>
    </section>
  );
}

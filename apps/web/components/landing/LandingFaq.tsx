import { ChevronDown } from "lucide-react";

import { LANDING_CONTACT, type LandingFaq as Faq } from "@/lib/landingContent";

type Props = {
  faqs: Faq[];
};

// FAQ (#faq): accordion <details name> — satu terbuka sekaligus tanpa JavaScript (browser lama: bebas terbuka).
// Pertanyaan pertama terbuka (snapshot landing.html).
export function LandingFaq({ faqs }: Props) {
  return (
    <section id="faq" className="grid scroll-mt-24 items-start gap-5 pb-section-sm lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-14 lg:pb-section">
      <div className="flex flex-col gap-3">
        <h2 className="text-balance font-display text-section-sm font-extrabold lg:text-section">Pertanyaan yang sering muncul</h2>
        <p className="hidden text-[17px] leading-[1.55] text-text-secondary lg:block">
          Belum terjawab? Tulis ke{" "}
          <a href={`mailto:${LANDING_CONTACT.email}`} className="font-bold text-accent-strong hover:text-accent-hover hover:underline">
            {LANDING_CONTACT.email}
          </a>
          .
        </p>
      </div>
      <div className="glass-strong exa-reveal flex flex-col rounded-card px-4.5 py-1 lg:px-7 lg:py-2">
        {faqs.map((faq, index) => (
          <details key={faq.q} name="landing-faq" open={index === 0} className="exa-accordion group border-t border-border-subtle first:border-t-0">
            <summary className="flex min-h-15 cursor-pointer list-none items-center gap-3 py-3.5 text-text-primary transition-colors hover:text-accent-strong lg:min-h-16 lg:gap-4 lg:py-4 [&::-webkit-details-marker]:hidden">
              <span className="flex-1 font-display text-[15.5px] leading-[1.4] font-bold lg:text-[17px]">{faq.q}</span>
              <ChevronDown aria-hidden className="size-4.5 shrink-0 transition-transform duration-300 ease-exa-out group-open:rotate-180 lg:size-5" />
            </summary>
            <p className="pb-4 text-[14.5px] leading-[1.6] text-pretty text-text-secondary lg:pr-10 lg:pb-5 lg:text-base">{faq.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

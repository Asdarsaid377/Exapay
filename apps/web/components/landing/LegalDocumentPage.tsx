import { ArrowLeft, ChevronDown } from "lucide-react";
import Link from "next/link";

import { AnalyticsScript } from "@/components/landing/AnalyticsScript";
import { LandingBackdrop } from "@/components/landing/LandingBackdrop";
import { LandingFooter } from "@/components/landing/LandingFooter";
import { LandingHeader } from "@/components/landing/LandingHeader";
import { RevealOnScroll } from "@/components/landing/RevealOnScroll";
import { formatLongDate } from "@/lib/datetime";
import type { LegalDocument } from "@/lib/legalContent";

type Props = {
  document: LegalDocument;
  // Tautan ke dokumen legal lainnya di akhir halaman
  related: { label: string; href: string };
};

// Halaman teks legal publik (/privasi, /syarat) — tanpa snapshot desain: dibangun dari ui-rules + ui-tokens dengan
// header, latar, dan footer landing (izin user 2026-10-03). Desktop: daftar isi sticky di kiri + artikel kaca;
// mobile: daftar isi <details> di atas artikel. Server component, tanpa JavaScript tambahan.
export function LegalDocumentPage({ document, related }: Props) {
  const toc = (
    <ol className="flex flex-col">
      {document.sections.map((section, index) => (
        <li key={section.id}>
          <a
            href={`#${section.id}`}
            className="flex min-h-10 items-baseline gap-2 rounded-inner px-2 py-1.5 text-sm text-text-secondary transition-colors hover:bg-control hover:text-accent-strong"
          >
            <span className="w-5 shrink-0 text-text-tertiary tabular-nums">{index + 1}.</span>
            {section.title}
          </a>
        </li>
      ))}
    </ol>
  );

  return (
    <div data-landing className="relative isolate overflow-x-clip">
      <RevealOnScroll />
      <AnalyticsScript />
      <LandingBackdrop />
      <div className="mx-auto flex w-full max-w-landing flex-col px-4 pt-3 lg:px-8 lg:pt-4 xl:px-0">
        <LandingHeader ctaLabel="Coba gratis" anchorBase="/" />
        <main className="flex flex-col gap-6 pt-8 pb-section-sm lg:gap-10 lg:pt-14">
          <div className="flex max-w-190 animate-exa-rise flex-col gap-3">
            <Link href="/" className="flex min-h-11 w-fit items-center gap-1.5 text-sm font-bold text-accent-strong hover:text-accent-hover">
              <ArrowLeft aria-hidden className="size-4" />
              Beranda
            </Link>
            <h1 className="font-display text-section-sm font-extrabold text-balance text-text-primary lg:text-section">{document.title}</h1>
            <p className="text-[15px] text-text-tertiary tabular-nums">
              Berlaku sejak {formatLongDate(new Date(`${document.effectiveDate}T12:00:00Z`), "UTC").replace(/^[^,]+, /, "")}
            </p>
            <p className="text-[16px] leading-[1.6] text-pretty text-text-secondary lg:text-[17px]">{document.description}</p>
          </div>

          <div className="grid items-start gap-5 lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-10">
            <nav aria-label="Daftar isi" className="glass hidden rounded-card p-3 lg:sticky lg:top-28 lg:block">
              <span className="block px-2 pt-1 pb-2 font-display text-sm font-bold text-text-primary">Daftar isi</span>
              {toc}
            </nav>
            <details className="glass group rounded-card px-4 lg:hidden">
              <summary className="flex min-h-13 cursor-pointer list-none items-center justify-between gap-3 font-display text-[15px] font-bold text-text-primary [&::-webkit-details-marker]:hidden">
                Daftar isi
                <ChevronDown aria-hidden className="size-4.5 shrink-0 transition-transform duration-200 group-open:rotate-180" />
              </summary>
              <nav aria-label="Daftar isi" className="pb-3">
                {toc}
              </nav>
            </details>

            <article className="glass-strong animate-exa-rise flex max-w-190 flex-col gap-8 rounded-card px-5 py-6 lg:gap-10 lg:px-10 lg:py-10">
              {document.intro.map((paragraph) => (
                <p key={paragraph} className="text-[15.5px] leading-[1.7] text-pretty text-text-primary lg:text-base">
                  {paragraph}
                </p>
              ))}
              {document.sections.map((section, index) => (
                <section key={section.id} id={section.id} aria-labelledby={`${section.id}-title`} className="flex scroll-mt-28 flex-col gap-3">
                  <h2 id={`${section.id}-title`} className="font-display text-[19px] leading-[1.3] font-bold text-text-primary lg:text-[21px]">
                    {index + 1}. {section.title}
                  </h2>
                  {section.paragraphs?.map((paragraph) => (
                    <p key={paragraph} className="text-[15px] leading-[1.7] text-pretty text-text-secondary lg:text-[15.5px]">
                      {paragraph}
                    </p>
                  ))}
                  {section.items ? (
                    <ul className="flex list-disc flex-col gap-2 pl-5 marker:text-accent">
                      {section.items.map((item) => (
                        <li key={item} className="pl-1 text-[15px] leading-[1.65] text-pretty text-text-secondary lg:text-[15.5px]">
                          {item}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {section.after?.map((paragraph) => (
                    <p key={paragraph} className="text-[15px] leading-[1.7] text-pretty text-text-secondary lg:text-[15.5px]">
                      {paragraph}
                    </p>
                  ))}
                </section>
              ))}
              <p className="border-t border-border-subtle pt-6 text-[15px] text-text-secondary">
                Baca juga{" "}
                <Link href={related.href} className="font-bold text-accent-strong hover:text-accent-hover hover:underline">
                  {related.label}
                </Link>
                .
              </p>
            </article>
          </div>
        </main>
        <LandingFooter anchorBase="/" />
      </div>
    </div>
  );
}

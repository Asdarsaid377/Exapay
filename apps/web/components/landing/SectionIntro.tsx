import type { ReactNode } from "react";

type Props = {
  title: string;
  children?: ReactNode;
};

// Judul + paragraf pembuka section landing (snapshot landing.html): J 800 30px mobile / 44px desktop, lebar maks 640px
export function SectionIntro({ title, children }: Props) {
  return (
    <div className="exa-reveal flex max-w-intro flex-col gap-2.5 lg:gap-3">
      <h2 className="text-balance font-display text-section-sm font-extrabold lg:text-section">{title}</h2>
      {children ? <p className="text-base leading-[1.55] text-pretty text-text-secondary lg:text-lg">{children}</p> : null}
    </div>
  );
}

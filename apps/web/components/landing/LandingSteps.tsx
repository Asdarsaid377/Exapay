import { LANDING_STEPS } from "@/lib/landingContent";

// Cara kerja (#cara-kerja): 3 langkah, angka sebagai tipografi besar — bukan lingkaran ikon
export function LandingSteps() {
  return (
    <section id="cara-kerja" className="flex scroll-mt-24 flex-col gap-7 pb-section-sm lg:gap-12 lg:pb-section">
      <h2 className="font-display text-section-sm font-extrabold lg:text-section">Mulai dalam satu sore</h2>
      <ol className="grid gap-7 lg:grid-cols-3 lg:gap-6">
        {LANDING_STEPS.map((step) => (
          <li key={step.n} className="flex flex-col gap-2.5 border-t-2 border-text-primary pt-4.5 lg:gap-4 lg:pt-6">
            <span aria-hidden className="font-display text-[64px] leading-[0.9] font-extrabold tracking-[-0.05em] text-accent-strong lg:text-step">
              {step.n}
            </span>
            <h3 className="text-balance font-display text-lg leading-[1.3] font-bold lg:text-[21px] lg:tracking-[-0.015em]">
              <span className="sr-only">Langkah {step.n}: </span>
              {step.title}
            </h3>
            <p className="text-[15px] leading-[1.55] text-pretty text-text-secondary lg:text-base">{step.body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

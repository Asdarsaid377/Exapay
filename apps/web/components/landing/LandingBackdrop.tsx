const SHAPE = "absolute";

// Bentuk warna flat di belakang kaca landing page — ikut ter-scroll (bukan fixed seperti BackdropShapes) karena halaman
// panjang. Posisi dari snapshot context/designs/landing.html (desktop 1440 & mobile 390). Tanpa gradient, tanpa blur.
export function LandingBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden bg-background">
      <div className={`${SHAPE} -top-35 -right-40 size-95 rounded-full bg-shape-peach lg:-top-65 lg:-right-45 lg:size-180 lg:animate-exa-drift`} />
      <div className={`${SHAPE} top-160 -left-40 size-75 rounded-full bg-shape-sand lg:top-130 lg:-left-50 lg:size-105`} />
      <div className={`${SHAPE} top-[37%] -right-80 h-90 w-105 rounded-[48px] bg-shape-apricot lg:top-[42%] lg:-right-65 lg:h-130 lg:w-225 lg:rounded-[64px] lg:animate-exa-drift lg:[animation-delay:-13s]`} />
      <div className={`${SHAPE} top-[62%] -left-35 size-85 rounded-full bg-shape-cream lg:top-[58%] lg:-left-45 lg:size-130`} />
      <div className={`${SHAPE} top-[84%] -right-30 hidden size-160 rounded-full bg-shape-peach lg:block`} />
    </div>
  );
}

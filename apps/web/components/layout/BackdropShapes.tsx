type Props = {
  // app: area sidebar · portal: /me · auth: kolom form halaman auth
  variant: "app" | "portal" | "auth";
};

const SHAPE = "absolute";

// Bentuk warna flat di belakang permukaan kaca (ui-rules "Latar & Lapisan Kaca"). Tanpa gradient, tanpa blur.
// Posisi dari snapshot context/designs/dashboard.html & me.html. fixed: kaca selalu punya latar saat halaman di-scroll.
export function BackdropShapes({ variant }: Props) {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-background">
      {variant === "app" ? (
        <>
          <div className={`${SHAPE} -top-30 -right-35 size-90 rounded-full bg-shape-peach lg:-top-60 lg:-right-40 lg:size-160`} />
          <div className={`${SHAPE} top-40 -left-35 hidden size-95 rounded-full bg-shape-sand lg:block`} />
          <div className={`${SHAPE} top-105 -left-30 size-75 rounded-full bg-shape-cream lg:top-[60vh] lg:left-[30vw] lg:size-110`} />
          <div className={`${SHAPE} -right-15 bottom-[-6rem] h-55 w-75 rounded-[44px] bg-shape-apricot lg:right-25 lg:bottom-[-10rem] lg:h-90 lg:w-145 lg:rounded-[56px]`} />
        </>
      ) : null}
      {variant === "portal" ? (
        <>
          <div className={`${SHAPE} -top-28 -right-38 size-95 rounded-full bg-shape-peach`} />
          <div className={`${SHAPE} top-45 -left-32 size-65 rounded-full bg-shape-sand`} />
          <div className={`${SHAPE} -bottom-10 -left-10 h-50 w-80 rounded-[44px] bg-shape-apricot`} />
        </>
      ) : null}
      {variant === "auth" ? (
        <>
          <div className={`${SHAPE} -top-30 -right-30 size-90 rounded-full bg-shape-peach lg:size-130`} />
          <div className={`${SHAPE} -bottom-16 -left-16 h-55 w-75 rounded-[44px] bg-shape-apricot lg:left-[42vw] lg:h-70 lg:w-110 lg:rounded-[56px]`} />
          <div className={`${SHAPE} top-[45%] -left-24 size-60 rounded-full bg-shape-cream lg:hidden`} />
        </>
      ) : null}
    </div>
  );
}

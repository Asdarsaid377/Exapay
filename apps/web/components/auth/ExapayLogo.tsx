type Props = {
  // "inverse" untuk latar gelap (panel foto halaman auth)
  tone?: "default" | "inverse";
};

// Placeholder mengikuti snapshot desain (context/designs/dashboard.html) sampai ada logo resmi
export function ExapayLogo({ tone = "default" }: Props) {
  return (
    <div className="flex items-center gap-2.5">
      <span aria-hidden className="grid size-8 place-items-center rounded-[10px] bg-accent font-display text-lg font-extrabold text-on-accent">
        e
      </span>
      <span className={`font-display text-[21px] font-extrabold tracking-[-0.03em] ${tone === "inverse" ? "text-on-inverse" : "text-text-primary"}`}>
        exapay
      </span>
    </div>
  );
}

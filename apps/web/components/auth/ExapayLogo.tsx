import { Wallet } from "lucide-react";

type Props = {
  // "inverse" untuk latar gelap (panel brand)
  tone?: "default" | "inverse";
};

export function ExapayLogo({ tone = "default" }: Props) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex size-9 items-center justify-center rounded-xl bg-accent text-on-accent shadow-accent">
        <Wallet aria-hidden className="size-5" />
      </span>
      <span
        className={`font-display text-xl font-extrabold tracking-tight ${tone === "inverse" ? "text-on-inverse" : "text-text-primary"}`}
      >
        Exapay
      </span>
    </div>
  );
}

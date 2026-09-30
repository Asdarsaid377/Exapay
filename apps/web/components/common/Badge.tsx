import type { ReactNode } from "react";

export type BadgeTone = "warning" | "success" | "danger" | "accent" | "neutral" | "info";

type Props = {
  tone: BadgeTone;
  children: ReactNode;
};

// Badge status (ui-rules "Badge Status"): pill tint 10–16% + teks gelap senada. Tanpa titik, tanpa ikon.
const TONE_CLASSES: Record<BadgeTone, string> = {
  warning: "bg-warning-soft text-warning-text",
  success: "bg-success-soft text-success-text",
  danger: "bg-danger-soft text-danger-text",
  accent: "bg-accent-soft text-accent-deep",
  neutral: "bg-text-primary/6 text-text-secondary",
  info: "bg-info-soft text-info-text",
};

export function Badge({ tone, children }: Props) {
  return (
    <span className={`inline-flex h-6.5 shrink-0 items-center rounded-full px-2.75 text-[12.5px] font-bold whitespace-nowrap ${TONE_CLASSES[tone]}`}>
      {children}
    </span>
  );
}

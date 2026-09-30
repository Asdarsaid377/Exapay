import { CircleAlert, CircleCheck, Info, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";

type Tone = "danger" | "success" | "info" | "warning";

type Props = {
  tone: Tone;
  children: ReactNode;
};

// Latar tint status + ikon berwarna, teks gelap (ui-rules "Badge Status" / "Alert peringatan")
const TONE_CLASSES: Record<Tone, { box: string; icon: string }> = {
  danger: { box: "bg-danger-soft", icon: "text-danger-text" },
  success: { box: "bg-success-soft", icon: "text-success" },
  info: { box: "bg-info-soft", icon: "text-info-text" },
  warning: { box: "border border-warning-border bg-warning-surface", icon: "text-warning-icon" },
};

const TONE_ICONS: Record<Tone, typeof Info> = {
  danger: CircleAlert,
  success: CircleCheck,
  info: Info,
  warning: TriangleAlert,
};

export function FormAlert({ tone, children }: Props) {
  const Icon = TONE_ICONS[tone];
  const { box, icon } = TONE_CLASSES[tone];
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={`flex items-start gap-2.5 rounded-field px-3.5 py-3 text-small ${box}`}>
      <Icon aria-hidden className={`mt-px size-4.5 shrink-0 ${icon}`} />
      <div className="text-text-primary">{children}</div>
    </div>
  );
}

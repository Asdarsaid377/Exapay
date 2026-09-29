import { CircleAlert, CircleCheck, Info } from "lucide-react";
import type { ReactNode } from "react";

type Tone = "danger" | "success" | "info";

type Props = {
  tone: Tone;
  children: ReactNode;
};

const TONE_CLASSES: Record<Tone, string> = {
  danger: "bg-danger-soft text-danger",
  success: "bg-success-soft text-success",
  info: "bg-info-soft text-info",
};

const TONE_ICONS: Record<Tone, typeof Info> = {
  danger: CircleAlert,
  success: CircleCheck,
  info: Info,
};

export function FormAlert({ tone, children }: Props) {
  const Icon = TONE_ICONS[tone];
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={`flex items-start gap-2 rounded-field px-4 py-3 text-sm ${TONE_CLASSES[tone]}`}>
      <Icon aria-hidden className="mt-0.5 size-4 shrink-0" />
      <div className="text-text-primary">{children}</div>
    </div>
  );
}

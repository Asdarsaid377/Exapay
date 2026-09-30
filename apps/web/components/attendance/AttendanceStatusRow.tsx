import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export type AttendanceRowTone = "success" | "warning" | "neutral";

type Props = {
  icon: LucideIcon;
  tone: AttendanceRowTone;
  children: ReactNode;
};

const TONE_CLASSES: Record<AttendanceRowTone, { box: string; icon: string; text: string }> = {
  success: { box: "bg-success-soft", icon: "text-success", text: "text-success-text" },
  warning: { box: "bg-warning-soft", icon: "text-warning-icon", text: "text-warning-text" },
  neutral: { box: "bg-fill-subtle", icon: "text-text-secondary", text: "text-text-primary" },
};

// Baris status di kartu absen (snapshot me.html: "Masuk 07:52 · Tepat waktu") — latar tint + ikon + teks tebal
export function AttendanceStatusRow({ icon: Icon, tone, children }: Props) {
  const classes = TONE_CLASSES[tone];
  return (
    <div className={`flex items-center gap-2.5 rounded-[14px] px-3.5 py-3 ${classes.box}`}>
      <Icon aria-hidden className={`size-4.5 shrink-0 ${classes.icon}`} />
      <span className={`text-[14.5px] font-bold ${classes.text}`}>{children}</span>
    </div>
  );
}

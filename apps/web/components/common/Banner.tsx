import { CircleAlert, type LucideIcon, TriangleAlert, UserX } from "lucide-react";
import type { ReactNode } from "react";

type Tone = "neutral" | "danger" | "warning";

type Props = {
  tone: Tone;
  title: string;
  description?: ReactNode;
  // Tombol di kanan (desktop) / di bawah teks (mobile)
  action?: ReactNode;
  // Ganti ikon bawaan tone (mis. UserX untuk karyawan nonaktif)
  icon?: LucideIcon;
};

// Banner status selebar konten (design-tokens "banner"): radius 18, border tint, ikon status 20px.
// Berbeda dengan FormAlert (kotak kecil di dalam form/dialog).
const TONE_CLASSES: Record<Tone, { box: string; icon: string; Icon: LucideIcon }> = {
  neutral: { box: "border-border-neutral bg-surface-solid/92", icon: "text-text-secondary", Icon: UserX },
  danger: { box: "border-danger-border bg-danger-surface", icon: "text-danger-text", Icon: CircleAlert },
  warning: { box: "border-warning-border bg-warning-surface", icon: "text-warning-icon", Icon: TriangleAlert },
};

export function Banner({ tone, title, description, action, icon }: Props) {
  const { box, icon: iconClass, Icon: DefaultIcon } = TONE_CLASSES[tone];
  const Icon = icon ?? DefaultIcon;
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={`flex flex-col gap-3 rounded-[18px] border px-4.5 py-3.5 backdrop-blur-glass sm:flex-row sm:items-center sm:gap-3.5 ${box}`}
    >
      <div className="flex min-w-0 flex-1 gap-3">
        <Icon aria-hidden className={`mt-px size-5 shrink-0 ${iconClass}`} />
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="text-[14.5px] font-bold text-text-primary">{title}</p>
          {description ? <div className="text-small text-text-secondary text-pretty">{description}</div> : null}
        </div>
      </div>
      {action ? <div className="shrink-0 max-sm:pl-8">{action}</div> : null}
    </div>
  );
}

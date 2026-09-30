import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

type Props = {
  // Ikon status opsional (ui-rules "Empty States") — tanpa kotak latar
  icon?: LucideIcon;
  // Warna ikon: accent (default, netral) atau success (mis. "semua sudah ditangani")
  iconTone?: "accent" | "success";
  title: string;
  description: string;
  // CTA jika ada aksi lanjutan yang logis
  action?: ReactNode;
  // glass (default) · solid: portal karyawan (batas lapisan blur) · none: di dalam card lain (tanpa kaca bertumpuk, judul h3)
  surface?: "glass" | "solid" | "none";
};

const SURFACE_CLASSES: Record<NonNullable<Props["surface"]>, string> = {
  glass: "glass-strong rounded-card py-12",
  solid: "surface-solid rounded-card py-12",
  none: "py-10",
};

// Card kaca kosong untuk section/halaman tanpa data
export function EmptyState({ icon: Icon, iconTone = "accent", title, description, action, surface = "glass" }: Props) {
  const Heading = surface === "none" ? "h3" : "h2";
  return (
    <section className={`${SURFACE_CLASSES[surface]} flex flex-col items-center gap-3 px-6 text-center sm:px-8`}>
      {Icon ? <Icon aria-hidden className={`size-7 ${iconTone === "success" ? "text-success" : "text-accent-strong"}`} /> : null}
      <div className="flex max-w-md flex-col gap-1.5">
        <Heading className="font-display text-base font-bold text-text-primary">{title}</Heading>
        <p className="text-sm text-text-secondary text-pretty">{description}</p>
      </div>
      {action ? <div className="mt-2">{action}</div> : null}
    </section>
  );
}

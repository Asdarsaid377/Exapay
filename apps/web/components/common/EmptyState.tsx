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
  // glass (default) · solid: portal karyawan (batas lapisan blur)
  surface?: "glass" | "solid";
};

// Card kaca kosong untuk section/halaman tanpa data
export function EmptyState({ icon: Icon, iconTone = "accent", title, description, action, surface = "glass" }: Props) {
  return (
    <section className={`${surface === "solid" ? "surface-solid" : "glass-strong"} flex flex-col items-center gap-3 rounded-card px-6 py-12 text-center sm:px-8`}>
      {Icon ? <Icon aria-hidden className={`size-7 ${iconTone === "success" ? "text-success" : "text-accent-strong"}`} /> : null}
      <div className="flex max-w-md flex-col gap-1.5">
        <h2 className="font-display text-base font-bold text-text-primary">{title}</h2>
        <p className="text-sm text-text-secondary text-pretty">{description}</p>
      </div>
      {action ? <div className="mt-2">{action}</div> : null}
    </section>
  );
}

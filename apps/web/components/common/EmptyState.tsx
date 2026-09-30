import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

type Props = {
  // Ikon status opsional (ui-rules "Empty States")
  icon?: LucideIcon;
  title: string;
  description: string;
  // CTA jika ada aksi lanjutan yang logis
  action?: ReactNode;
};

// Card kosong untuk section/halaman tanpa data
export function EmptyState({ icon: Icon, title, description, action }: Props) {
  return (
    <section className="flex flex-col items-center gap-4 rounded-card border border-border bg-surface px-6 py-12 text-center shadow-card sm:px-8">
      {Icon ? (
        <div className="flex size-11 items-center justify-center rounded-field bg-accent-soft text-accent">
          <Icon aria-hidden className="size-5" />
        </div>
      ) : null}
      <div className="flex max-w-md flex-col gap-1.5">
        <h2 className="font-display text-base font-bold text-text-primary">{title}</h2>
        <p className="text-sm text-text-muted">{description}</p>
      </div>
      {action}
    </section>
  );
}

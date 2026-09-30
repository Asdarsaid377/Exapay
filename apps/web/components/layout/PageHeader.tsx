import type { ReactNode } from "react";

type Props = {
  title: string;
  description?: ReactNode;
  // Tombol aksi di kanan judul (desktop) / di bawah judul (mobile)
  actions?: ReactNode;
};

// Judul halaman di dalam app shell & portal
export function PageHeader({ title, description, actions }: Props) {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex min-w-0 flex-col gap-1.5">
        <h1 className="font-display text-2xl font-extrabold tracking-tight text-text-primary">{title}</h1>
        {description ? <p className="text-sm text-text-secondary">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 gap-3">{actions}</div> : null}
    </header>
  );
}

import { Lock } from "lucide-react";
import type { ReactNode } from "react";

type Props = {
  title: string;
  description?: string;
  // Catatan gembok "Disimpan terenkripsi…" untuk section berisi data sensitif
  lockNote?: string;
  // Elemen tambahan di kolom judul (mis. tombol Tampilkan). Mobile: di kanan judul.
  aside?: ReactNode;
  children: ReactNode;
};

// Section form/tampilan baca sebagai card kaca sendiri (design-tokens "form-section"):
// desktop 2 kolom (judul + penjelasan 280px | isi), mobile bertumpuk.
export function FormSection({ title, description, lockNote, aside, children }: Props) {
  return (
    <section className="glass-strong grid gap-4 rounded-card p-4.5 lg:grid-cols-[280px_minmax(0,1fr)] lg:gap-10 lg:p-7">
      <div className="flex flex-col gap-2">
        <div className="flex min-h-9 items-center justify-between gap-3 lg:block lg:min-h-0">
          <h2 className="font-display text-base font-bold tracking-[-0.01em] text-text-primary lg:text-[17px]">{title}</h2>
          {aside ? <div className="lg:hidden">{aside}</div> : null}
        </div>
        {description ? <p className="text-small text-text-secondary text-pretty lg:text-sm">{description}</p> : null}
        {lockNote ? (
          <p className="flex items-center gap-2 text-[13px] text-text-secondary">
            <Lock aria-hidden className="size-3.75 shrink-0" />
            {lockNote}
          </p>
        ) : null}
        {aside ? <div className="hidden flex-col items-start gap-2.5 pt-0.5 lg:flex">{aside}</div> : null}
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

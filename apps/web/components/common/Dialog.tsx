"use client";

import { X } from "lucide-react";
import { type ReactNode, useEffect, useId, useRef } from "react";

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  // Tombol aksi di bawah (mis. Batal + Simpan)
  footer?: ReactNode;
  // Tutup via Escape/overlay dinonaktifkan saat aksi berjalan
  dismissible?: boolean;
};

// Modal kaca overlay (ui-rules: surface-glass-overlay untuk modal). Native <dialog>: fokus terkunci di dalam,
// Escape menutup, konten di belakang tidak bisa diklik. Mobile: menempel di bawah layar.
// text-left: dialog bisa dirender di dalam sel tabel rata kanan — perataan induk tidak boleh terwarisi.
export function Dialog({ open, onClose, title, description, children, footer, dismissible = true }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        if (dismissible) onClose();
      }}
      onClick={(event) => {
        // Klik di luar panel (area ::backdrop) mengenai elemen <dialog> itu sendiri
        if (event.target === event.currentTarget && dismissible) onClose();
      }}
      className="glass-overlay m-0 mt-auto w-full max-w-none rounded-t-sheet p-0 text-left text-text-primary backdrop:bg-inverse/32 sm:m-auto sm:w-[calc(100vw-2rem)] sm:max-w-lg sm:rounded-sheet"
    >
      <div className="flex max-h-[calc(100dvh-2rem)] flex-col gap-5 overflow-y-auto p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:p-7">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 flex-col gap-1.5">
            <h2 id={titleId} className="font-display text-xl leading-tight font-extrabold tracking-[-0.02em]">
              {title}
            </h2>
            {description ? <div className="text-sm text-text-secondary text-pretty">{description}</div> : null}
          </div>
          <button
            type="button"
            aria-label="Tutup"
            disabled={!dismissible}
            onClick={onClose}
            className="-mt-1.5 -mr-2 grid size-11 shrink-0 place-items-center rounded-field text-text-primary transition-colors hover:bg-glass-hover focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-accent/45 disabled:opacity-50"
          >
            <X aria-hidden className="size-5" />
          </button>
        </div>
        {children}
        {footer ? <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">{footer}</div> : null}
      </div>
    </dialog>
  );
}

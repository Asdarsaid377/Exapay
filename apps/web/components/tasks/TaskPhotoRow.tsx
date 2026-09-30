import { X } from "lucide-react";

type Props = {
  src: string;
  title: string;
  caption: string;
  onRemove: () => void;
  disabled: boolean;
};

// Foto terpilih / tersimpan: pratinjau kecil + nama + ukuran + tombol hapus (pola baris lampiran LeaveRequestFormDialog)
export function TaskPhotoRow({ src, title, caption, onRemove, disabled }: Props) {
  return (
    <div className="flex items-center gap-3 rounded-field border border-border-control bg-control py-1.5 pr-1.5 pl-1.5">
      {/* Foto privat lewat Route Handler / object URL — next/image tidak dipakai */}
      <img src={src} alt="" className="size-12 shrink-0 rounded-inner object-cover" />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-bold text-text-primary">{title}</span>
        <span className="text-caption text-text-tertiary tabular-nums">{caption}</span>
      </div>
      <button
        type="button"
        aria-label="Hapus foto"
        disabled={disabled}
        onClick={onRemove}
        className="grid size-11 shrink-0 place-items-center rounded-field text-text-secondary transition-colors hover:bg-fill-subtle hover:text-text-primary focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-accent/45 disabled:opacity-50"
      >
        <X aria-hidden className="size-4.5" />
      </button>
    </div>
  );
}

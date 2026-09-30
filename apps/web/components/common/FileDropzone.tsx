"use client";

import { LoaderCircle, Upload } from "lucide-react";
import { type ChangeEvent, type DragEvent, useState } from "react";

type Props = {
  id: string;
  // Atribut accept input file, mis. ".xlsx"
  accept: string;
  // Keterangan batas file, mis. ".xlsx · maks. 1 MB"
  hint: string;
  onSelect: (file: File) => void;
  // Sedang memproses file terpilih (spinner + teks loading)
  loading?: boolean;
  loadingLabel?: string;
  disabled?: boolean;
  error?: string;
};

// Area pilih/tarik file (diturunkan dari Input design-tokens): kotak bergaris putus-putus di atas permukaan field.
// Input file asli tetap bisa difokus keyboard (sr-only) — cincin fokus tampil di kotak.
export function FileDropzone({ id, accept, hint, onSelect, loading = false, loadingLabel = "Memproses file…", disabled = false, error }: Props) {
  const [dragging, setDragging] = useState(false);
  const locked = disabled || loading;

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Dikosongkan agar file yang sama bisa dipilih lagi (mis. setelah diperbaiki)
    event.target.value = "";
    if (file) onSelect(file);
  }

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragging(false);
    if (locked) return;
    const file = event.dataTransfer.files[0];
    if (file) onSelect(file);
  }

  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={id}
        onDragOver={(event) => {
          event.preventDefault();
          if (!locked) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={`flex min-h-44 flex-col items-center justify-center gap-2.5 rounded-field border-2 border-dashed px-5 py-8 text-center transition-colors has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-accent/45 ${
          locked ? "cursor-wait" : "cursor-pointer hover:border-accent hover:bg-surface-solid"
        } ${dragging ? "border-accent bg-accent/6" : error ? "border-danger bg-control" : "border-border-control bg-control"}`}
      >
        <input id={id} type="file" accept={accept} className="sr-only" onChange={handleChange} disabled={locked} aria-invalid={error ? true : undefined} aria-describedby={`${id}-hint`} />
        {loading ? (
          <LoaderCircle aria-hidden className="size-6 animate-spin text-accent-strong" />
        ) : (
          <Upload aria-hidden className="size-6 text-text-secondary" />
        )}
        <span className="text-[15px] font-bold text-text-primary">{loading ? loadingLabel : dragging ? "Lepaskan file di sini" : "Pilih file atau tarik ke sini"}</span>
        <span id={`${id}-hint`} className="text-caption text-text-tertiary">
          {hint}
        </span>
      </label>
      {error ? (
        <p role="alert" className="text-caption text-danger-text">
          {error}
        </p>
      ) : null}
    </div>
  );
}

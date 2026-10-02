import type { TextareaHTMLAttributes } from "react";

type Props = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "id"> & {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  // Tanda wajib diisi (* merah) setelah label
  requiredMark?: boolean;
};

// Teks multi-baris bergaya TextField (ui-rules "Form Inputs"); tinggi awal 3 baris, bisa diperbesar vertikal
export function TextAreaField({ id, label, error, hint, requiredMark = false, className, rows = 3, ...rest }: Props) {
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  const classes = [
    "min-h-24 w-full resize-y rounded-field border bg-control px-3.5 py-2.5 text-body text-text-primary placeholder:text-text-muted transition-[border-color,box-shadow,background-color]",
    "focus:bg-surface-solid focus:outline-none focus:ring-3 focus:ring-accent/28",
    "disabled:border-border-subtle disabled:bg-fill-subtle disabled:text-text-tertiary",
    error ? "border-danger focus:border-danger" : "border-border-control focus:border-accent",
    className ?? "",
  ].join(" ");

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[13px] font-bold text-text-primary">
        {label}
        {requiredMark ? <span className="text-danger-text"> *</span> : null}
      </label>
      <textarea id={id} rows={rows} aria-invalid={error ? true : undefined} aria-describedby={describedBy} className={classes} {...rest} />
      {error ? (
        <p id={`${id}-error`} className="text-caption text-danger-text">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-caption text-text-tertiary">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

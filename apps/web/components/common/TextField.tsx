import type { InputHTMLAttributes, ReactNode } from "react";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "id"> & {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  // Aksi kecil di kanan label (mis. tautan "Lupa password?")
  labelAction?: ReactNode;
  // Elemen di dalam input sebelah kanan (mis. tombol tampilkan password)
  trailing?: ReactNode;
};

export function TextField({ id, label, error, hint, labelAction, trailing, className, ...rest }: Props) {
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  const inputClasses = [
    "w-full rounded-field border bg-surface-secondary px-4 py-3 text-sm text-text-primary placeholder:text-text-muted transition-colors",
    "focus:bg-surface focus:outline-none focus:ring-1 disabled:opacity-70",
    error ? "border-danger focus:border-danger focus:ring-danger" : "border-border focus:border-accent focus:ring-accent",
    trailing ? "pr-11" : "",
    className ?? "",
  ].join(" ");

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <label htmlFor={id} className="text-sm font-semibold text-text-primary">
          {label}
        </label>
        {labelAction}
      </div>
      <div className="relative">
        <input id={id} aria-invalid={error ? true : undefined} aria-describedby={describedBy} className={inputClasses} {...rest} />
        {trailing ? <div className="absolute inset-y-0 right-0 flex items-center pr-3">{trailing}</div> : null}
      </div>
      {error ? (
        <p id={`${id}-error`} className="text-xs text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-xs text-text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

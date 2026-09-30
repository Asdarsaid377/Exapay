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
    "h-11 w-full rounded-field border bg-control px-3.5 text-body text-text-primary placeholder:text-text-muted transition-[border-color,box-shadow,background-color]",
    "focus:bg-surface-solid focus:outline-none focus:ring-3 focus:ring-accent/28",
    "disabled:border-border-subtle disabled:bg-fill-subtle disabled:text-text-tertiary",
    error ? "border-danger focus:border-danger" : "border-border-control focus:border-accent",
    trailing ? "pr-11" : "",
    className ?? "",
  ].join(" ");

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <label htmlFor={id} className="text-[13px] font-bold text-text-primary">
          {label}
        </label>
        {labelAction}
      </div>
      <div className="relative">
        <input id={id} aria-invalid={error ? true : undefined} aria-describedby={describedBy} className={inputClasses} {...rest} />
        {trailing ? <div className="absolute inset-y-0 right-0 flex items-center pr-1.5">{trailing}</div> : null}
      </div>
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

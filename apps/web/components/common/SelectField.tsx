import { ChevronDown } from "lucide-react";
import type { ReactNode, SelectHTMLAttributes } from "react";

type Props = Omit<SelectHTMLAttributes<HTMLSelectElement>, "id"> & {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  // <option> — termasuk opsi kosong/placeholder jika perlu
  children: ReactNode;
};

// <select> native bergaya TextField (ui-rules "Form Inputs"): aksesibel & ramah HP tanpa library.
export function SelectField({ id, label, error, hint, className, children, ...rest }: Props) {
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  const selectClasses = [
    "h-11 w-full appearance-none rounded-field border bg-control pr-10 pl-3.5 text-body text-text-primary transition-[border-color,box-shadow,background-color]",
    "focus:bg-surface-solid focus:outline-none focus:ring-3 focus:ring-accent/28",
    "disabled:border-border-subtle disabled:bg-fill-subtle disabled:text-text-tertiary",
    error ? "border-danger focus:border-danger" : "border-border-control focus:border-accent",
    className ?? "",
  ].join(" ");

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[13px] font-bold text-text-primary">
        {label}
      </label>
      <div className="relative">
        <select id={id} aria-invalid={error ? true : undefined} aria-describedby={describedBy} className={selectClasses} {...rest}>
          {children}
        </select>
        <ChevronDown aria-hidden className="pointer-events-none absolute top-1/2 right-3.5 size-4.5 -translate-y-1/2 text-text-secondary" />
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

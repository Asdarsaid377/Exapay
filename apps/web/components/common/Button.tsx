import { LoaderCircle } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  loading?: boolean;
  fullWidth?: boolean;
  children: ReactNode;
};

const VARIANT_CLASSES: Record<Variant, string> = {
  primary: "bg-accent text-on-accent shadow-accent hover:bg-accent-hover",
  secondary: "bg-surface text-text-primary border-2 border-border-strong hover:bg-surface-secondary",
};

export function Button({
  variant = "primary",
  loading = false,
  fullWidth = false,
  disabled,
  className,
  children,
  type = "button",
  ...rest
}: Props) {
  const classes = [
    "inline-flex items-center justify-center gap-2 rounded-full px-6 py-2.5 text-sm font-semibold transition-colors",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2",
    "disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none",
    VARIANT_CLASSES[variant],
    fullWidth ? "w-full" : "",
    className ?? "",
  ].join(" ");

  return (
    <button type={type} disabled={disabled || loading} aria-busy={loading} className={classes} {...rest}>
      {loading ? <LoaderCircle aria-hidden className="size-4 animate-spin" /> : null}
      {children}
    </button>
  );
}

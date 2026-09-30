import { LoaderCircle } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "dark";
type Size = "md" | "lg";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  // md: 40px (desktop) · lg: 48px (form auth & aksi mobile)
  size?: Size;
  loading?: boolean;
  fullWidth?: boolean;
  children: ReactNode;
};

type ClassOptions = { variant?: Variant; size?: Size; fullWidth?: boolean; loading?: boolean; className?: string };

const VARIANT_CLASSES: Record<Variant, string> = {
  // Teks cokelat tua di atas oranye (6,6:1) — bukan putih
  primary: "bg-accent text-on-accent hover:bg-accent-hover",
  secondary: "border border-border-control bg-control text-text-primary hover:border-border-control-hover hover:bg-surface-solid",
  // Aksi penutup (mis. Absen Pulang)
  dark: "bg-inverse text-on-inverse hover:bg-inverse-hover",
};

const SIZE_CLASSES: Record<Size, string> = {
  md: "h-10 px-5",
  lg: "h-12 px-6",
};

// Kelas tombol untuk <Link> bergaya tombol — sama persis dengan <Button>
export function buttonClassName({ variant = "primary", size = "md", fullWidth = false, loading = false, className }: ClassOptions = {}): string {
  return [
    "inline-flex items-center justify-center gap-2 rounded-full font-display text-sm font-bold transition-[background-color,border-color,transform] active:scale-[0.97]",
    "focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-accent/45",
    // Loading tetap berwarna varian (hanya dikunci); disabled biasa menjadi abu-abu
    loading
      ? "cursor-wait opacity-90"
      : "disabled:cursor-not-allowed disabled:border-transparent disabled:bg-fill disabled:text-text-muted disabled:active:scale-100",
    VARIANT_CLASSES[variant],
    SIZE_CLASSES[size],
    fullWidth ? "w-full" : "",
    className ?? "",
  ].join(" ");
}

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  fullWidth = false,
  disabled,
  className,
  children,
  type = "button",
  ...rest
}: Props) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading}
      className={buttonClassName({ variant, size, fullWidth, loading, className })}
      {...rest}
    >
      {loading ? <LoaderCircle aria-hidden className="size-4 animate-spin" /> : null}
      {children}
    </button>
  );
}

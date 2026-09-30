"use client";

import { type KeyboardEvent, useRef } from "react";

type Option<T extends string> = { value: T; label: string };

type Props<T extends string> = {
  // Label aksesibel grup (mis. "Status kerja")
  label: string;
  options: readonly Option<T>[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
  // Lebar penuh dengan kolom sama rata (mobile)
  fullWidth?: boolean;
  // md: 36px (desktop) · lg: 40px (form mobile)
  size?: "md" | "lg";
  id?: string;
};

// Pilihan tunggal berbentuk pill (design-tokens "segmented"): track 6%, thumb putih + shadow-segment.
// Radio group: panah kiri/kanan berpindah pilihan, satu tab stop.
export function SegmentedControl<T extends string>({ label, options, value, onChange, disabled, fullWidth, size = "md", id }: Props<T>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  function handleKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const step = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const next = (index + step + options.length) % options.length;
    const option = options[next];
    if (!option) return;
    onChange(option.value);
    refs.current[next]?.focus();
  }

  return (
    <div
      id={id}
      role="radiogroup"
      aria-label={label}
      aria-disabled={disabled || undefined}
      className={`gap-0.5 rounded-full bg-segment-track p-1 ${fullWidth ? "grid auto-cols-fr grid-flow-col" : "inline-flex self-start"}`}
    >
      {options.map((option, index) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            ref={(el) => {
              refs.current[index] = el;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            disabled={disabled}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => handleKey(event, index)}
            className={`rounded-full px-4 text-sm whitespace-nowrap transition-[background-color,color,box-shadow] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-accent/45 disabled:cursor-not-allowed ${
              size === "lg" ? "h-10" : "h-9"
            } ${selected ? "bg-surface-solid font-bold text-text-primary shadow-segment" : "font-medium text-text-secondary hover:bg-control/60 hover:text-text-primary"}`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

"use client";

import { type ReactNode, useEffect, useId, useRef, useState } from "react";

type Props = {
  // Label aksesibel tombol pemicu (mis. "Ganti usaha")
  label: string;
  trigger: ReactNode;
  triggerClassName?: string;
  align?: "start" | "end";
  // Isi panel; `close` untuk menutup setelah aksi
  children: (close: () => void) => ReactNode;
};

// Panel mengambang di bawah tombol. Tertutup saat klik di luar atau tombol Escape.
export function DropdownMenu({ label, trigger, triggerClassName, align = "start", children }: Props) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    function handlePointer(event: MouseEvent) {
      if (event.target instanceof Node && !containerRef.current?.contains(event.target)) setOpen(false);
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    }
    document.addEventListener("mousedown", handlePointer);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handlePointer);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative min-w-0">
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
        className={`focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${triggerClassName ?? ""}`}
      >
        {trigger}
      </button>
      {open ? (
        <div
          id={panelId}
          className={`absolute top-full z-30 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-field border border-border bg-surface p-2 shadow-card ${align === "end" ? "right-0" : "left-0"}`}
        >
          {children(() => setOpen(false))}
        </div>
      ) : null}
    </div>
  );
}

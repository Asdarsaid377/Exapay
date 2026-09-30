"use client";

import { Check, Search } from "lucide-react";
import { type KeyboardEvent, useEffect, useId, useRef, useState } from "react";

export type ComboboxOption = { value: string; label: string; description?: string };

type Props = {
  id: string;
  label: string;
  options: readonly ComboboxOption[];
  value: string | null;
  onChange: (value: string | null) => void;
  placeholder?: string;
  error?: string;
  hint?: string;
  disabled?: boolean;
  emptyText?: string;
};

// Pilihan dari daftar panjang dengan pencarian (design employees-new "Combobox bank").
// Input = kotak cari; daftar muncul di bawah (glass-overlay). Panah atas/bawah + Enter memilih, Escape menutup.
export function Combobox({ id, label, options, value, onChange, placeholder, error, hint, disabled, emptyText = "Tidak ada yang cocok" }: Props) {
  const listId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  const selected = options.find((option) => option.value === value) ?? null;
  const q = query.trim().toLowerCase();
  const filtered = q ? options.filter((o) => o.label.toLowerCase().includes(q) || (o.description ?? "").toLowerCase().includes(q)) : options;

  useEffect(() => {
    if (!open) return;
    function handlePointer(event: MouseEvent) {
      if (event.target instanceof Node && !containerRef.current?.contains(event.target)) close();
    }
    document.addEventListener("mousedown", handlePointer);
    return () => document.removeEventListener("mousedown", handlePointer);
  }, [open]);

  function close() {
    setOpen(false);
    setQuery("");
  }

  function choose(option: ComboboxOption) {
    onChange(option.value);
    close();
  }

  function handleKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) setOpen(true);
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((current) => (filtered.length ? (current + step + filtered.length) % filtered.length : 0));
    } else if (event.key === "Enter" && open) {
      event.preventDefault();
      const option = filtered[active];
      if (option) choose(option);
    } else if (event.key === "Escape" && open) {
      event.preventDefault();
      close();
    }
  }

  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  const activeOption = open ? filtered[active] : undefined;

  return (
    <div ref={containerRef} className="relative flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[13px] font-bold text-text-primary">
        {label}
      </label>
      <div className="relative">
        <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3.5 size-4.25 -translate-y-1/2 text-text-tertiary" />
        <input
          id={id}
          type="text"
          role="combobox"
          autoComplete="off"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={activeOption ? `${listId}-${activeOption.value}` : undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          disabled={disabled}
          placeholder={selected ? `${selected.label} · ${selected.description ?? ""}` : placeholder}
          value={open ? query : selected ? `${selected.label}${selected.description ? ` · ${selected.description}` : ""}` : ""}
          onFocus={() => {
            setOpen(true);
            setActive(Math.max(0, options.findIndex((o) => o.value === value)));
          }}
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
            setOpen(true);
          }}
          onKeyDown={handleKey}
          className={[
            "h-11 w-full truncate rounded-field border bg-control pr-3.5 pl-10.5 text-body text-text-primary placeholder:text-text-muted transition-[border-color,box-shadow,background-color]",
            "focus:bg-surface-solid focus:outline-none focus:ring-3 focus:ring-accent/28",
            "disabled:border-border-subtle disabled:bg-fill-subtle disabled:text-text-tertiary",
            error ? "border-danger focus:border-danger" : "border-border-control focus:border-accent",
          ].join(" ")}
        />
      </div>
      {open ? (
        <ul id={listId} role="listbox" aria-label={label} className="glass-overlay absolute top-full z-30 mt-1 flex max-h-72 w-full flex-col gap-0.5 overflow-y-auto rounded-[18px] p-2">
          {value ? (
            <li role="presentation">
              <button
                type="button"
                tabIndex={-1}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onChange(null);
                  close();
                }}
                className="flex min-h-10 w-full items-center rounded-inner px-3 text-left text-small text-text-secondary hover:bg-row-hover"
              >
                Kosongkan pilihan
              </button>
            </li>
          ) : null}
          {filtered.length === 0 ? <li className="px-3 py-2.5 text-small text-text-secondary">{emptyText}</li> : null}
          {filtered.map((option, index) => {
            const isSelected = option.value === value;
            return (
              <li
                key={option.value}
                id={`${listId}-${option.value}`}
                role="option"
                aria-selected={isSelected}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActive(index)}
                onClick={() => choose(option)}
                className={`flex min-h-11 cursor-pointer items-center justify-between gap-2.5 rounded-inner px-3 py-1.5 ${
                  index === active ? "bg-accent/10" : ""
                }`}
              >
                <span className="flex min-w-0 flex-col">
                  <span className="text-sm font-bold text-text-primary">{option.label}</span>
                  {option.description ? <span className="truncate text-caption text-text-secondary">{option.description}</span> : null}
                </span>
                {isSelected ? <Check aria-hidden className="size-4.5 shrink-0 text-accent-strong" /> : null}
              </li>
            );
          })}
        </ul>
      ) : null}
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

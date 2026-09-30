"use client";

import type { ReactNode } from "react";

import { TextField } from "@/components/common/TextField";
import { groupThousands, sanitizeMoneyInput } from "@/lib/money";

type Props = {
  id: string;
  label: string;
  // Digit rupiah tanpa pemisah ("1500000"); kosong = belum diisi
  value: string;
  onChange: (digits: string) => void;
  error?: string;
  hint?: ReactNode;
  requiredMark?: boolean;
  disabled?: boolean;
  placeholder?: string;
};

// Isian nominal rupiah penuh: awalan "Rp", ditampilkan dengan pemisah ribuan titik, disimpan sebagai digit (string, bukan number).
export function MoneyField({ id, label, value, onChange, error, hint, requiredMark, disabled, placeholder }: Props) {
  return (
    <TextField
      id={id}
      label={label}
      leading="Rp"
      inputMode="numeric"
      autoComplete="off"
      value={groupThousands(value)}
      onChange={(e) => onChange(sanitizeMoneyInput(e.target.value))}
      error={error}
      hint={hint}
      requiredMark={requiredMark}
      disabled={disabled}
      placeholder={placeholder}
      className="tabular-nums"
    />
  );
}

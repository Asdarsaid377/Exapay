"use client";

import { billingEstimateAmount, formatRupiah } from "@exapay/shared";
import { Minus, Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { buttonClassName } from "@/components/common/Button";

type Props = {
  pricePerEmployee: string;
  minBilledEmployees: number;
  ctaLabel: string;
};

const MIN = 1;
const MAX = 50;
const DEFAULT_EMPLOYEES = 15;

// "Rp 150.000" → "Rp150.000" (gaya harga landing)
function compactRupiah(value: string): string {
  return formatRupiah(value).replace("Rp ", "Rp");
}

// Kalkulator estimasi tagihan (#harga): stepper + slider 1–50 karyawan. Rumus dari @exapay/shared (sama dengan
// estimasi /settings/billing), harga dari data harga berlaku.
export function PriceCalculator({ pricePerEmployee, minBilledEmployees, ctaLabel }: Props) {
  const [employees, setEmployees] = useState(DEFAULT_EMPLOYEES);
  const isMin = employees < minBilledEmployees;
  const total = compactRupiah(billingEstimateAmount(pricePerEmployee, minBilledEmployees, employees));
  const price = compactRupiah(pricePerEmployee);
  const formula = isMin ? `${employees} karyawan aktif · ditagih ${minBilledEmployees} × ${price}` : `${employees} karyawan aktif × ${price}`;

  const set = (value: number): void => setEmployees(Math.min(MAX, Math.max(MIN, value)));
  const stepClass =
    "grid size-12 shrink-0 place-items-center rounded-full border border-border-control bg-control text-text-primary transition-colors hover:border-border-control-hover hover:bg-surface-solid disabled:opacity-40 disabled:hover:bg-control";

  return (
    <div className="glass-strong flex flex-col gap-4 rounded-card p-5.5 lg:gap-5.5 lg:p-8">
      <h3 className="font-display text-base font-bold lg:text-lg">Hitung estimasi tagihan</h3>
      <div className="flex flex-col gap-3">
        <label htmlFor="landing-employees" className="hidden text-sm font-medium text-text-secondary lg:block">
          Jumlah karyawan aktif
        </label>
        <div className="flex items-center gap-2.5">
          <button type="button" onClick={() => set(employees - 1)} disabled={employees <= MIN} aria-label="Kurangi karyawan" className={stepClass}>
            <Minus aria-hidden className="size-4.5" />
          </button>
          <output
            htmlFor="landing-employees"
            aria-live="polite"
            className="grid h-12 flex-1 place-items-center rounded-field border border-border-control bg-surface-solid font-display text-[19px] font-extrabold tabular-nums lg:w-22 lg:flex-none lg:text-xl"
          >
            <span>
              {employees}
              <span className="lg:hidden"> karyawan</span>
            </span>
          </output>
          <button type="button" onClick={() => set(employees + 1)} disabled={employees >= MAX} aria-label="Tambah karyawan" className={stepClass}>
            <Plus aria-hidden className="size-4.5" />
          </button>
          <span className="hidden text-[15px] text-text-secondary lg:inline">karyawan</span>
        </div>
        <input
          id="landing-employees"
          type="range"
          min={MIN}
          max={MAX}
          value={employees}
          onChange={(event) => set(Number(event.target.value))}
          aria-label="Jumlah karyawan aktif"
          className="h-7 w-full cursor-pointer accent-accent"
        />
        <div className="hidden justify-between text-[12.5px] text-text-tertiary lg:flex">
          <span>{MIN}</span>
          <span>{MAX}</span>
        </div>
      </div>
      <div className="flex flex-col gap-1 rounded-[14px] border border-border-subtle bg-surface-solid p-4 lg:gap-1.5 lg:p-5">
        <span className="text-[13.5px] text-text-secondary lg:text-sm">Estimasi tagihan per bulan</span>
        <span className="font-display text-[32px] leading-[1.05] font-extrabold tracking-[-0.03em] tabular-nums lg:text-[40px]">{total}</span>
        <span className="text-[13px] text-text-secondary lg:text-[13.5px]">{formula}</span>
        {isMin ? <span className="mt-1 text-[13px] font-bold text-warning-text lg:mt-1.5 lg:text-[13.5px]">Minimum ditagih {minBilledEmployees} karyawan</span> : null}
      </div>
      <Link href="/signup" className={buttonClassName({ size: "lg", fullWidth: true, className: "h-13 text-base" })}>
        {ctaLabel}
      </Link>
    </div>
  );
}

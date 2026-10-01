import { formatRupiah, trimDecimal } from "@exapay/shared";
import { Decimal } from "decimal.js";

// Konstruktor Decimal khusus payroll: presisi lebar untuk hasil antara, pembulatan eksplisit HALF_UP
// (tidak bergantung default global decimal.js yang bisa diubah modul lain).
export const Money = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });
export type Money = InstanceType<typeof Money>;

export const ZERO = new Money(0);

export function money(value: string): Money {
  return new Money(value);
}

// Pembulatan hasil potongan: rupiah penuh, HALF_UP (≥ 0,5 ke atas). Keputusan feature 17 — slip gaji tanpa sen.
export function roundRupiah(value: Money): Money {
  return value.toDecimalPlaces(0, Money.ROUND_HALF_UP);
}

// Format kolom numeric(18,2) — "681818.00"
export function toMoneyString(value: Money): string {
  return value.toFixed(2);
}

// Tampilan di langkah perhitungan; nilai antara (mis. tarif per hari) ditampilkan 2 desimal
export function rupiah(value: Money): string {
  return formatRupiah(value.toFixed(2));
}

// Tarif persen numeric(7,4) → tampilan "3,7%" / "0,24%"
export function percent(value: string): string {
  return `${trimDecimal(value).replace(".", ",")}%`;
}

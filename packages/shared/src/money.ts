import { z } from "zod";

// Uang dikirim antar lapisan sebagai string desimal ("5000000" / "5000000.00") — tidak pernah number.
// Perhitungan memakai decimal.js di payroll-engine; di sini hanya validasi & format tampilan (operasi string).

// Maks. 13 digit rupiah + 2 desimal — muat di numeric(18,2)
const MONEY_PATTERN = /^[0-9]{1,13}(\.[0-9]{1,2})?$/;

export const moneySchema = z.string("Nominal wajib diisi").regex(MONEY_PATTERN, "Nominal tidak valid");

// Nominal > 0
export const positiveMoneySchema = moneySchema.refine((value) => /[1-9]/.test(value), "Nominal harus lebih dari 0");

// "5000000.5" → "Rp 5.000.000,50"; ",00" dihilangkan. Tanda minus dipertahankan.
export function formatRupiah(value: string): string {
  const negative = value.startsWith("-");
  const [whole = "0", fraction = ""] = (negative ? value.slice(1) : value).split(".");
  const grouped = whole.replace(/^0+(?=[0-9])/, "").replace(/\B(?=([0-9]{3})+(?![0-9]))/g, ".");
  const cents = fraction.padEnd(2, "0").slice(0, 2);
  return `${negative ? "-" : ""}Rp ${grouped}${cents === "00" ? "" : `,${cents}`}`;
}

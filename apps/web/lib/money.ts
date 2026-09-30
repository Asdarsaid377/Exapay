// Isian uang di form: digit rupiah penuh sebagai string (tidak pernah number). Format tampilan Rp ada di formatRupiah (@exapay/shared).

// Uang dari API ("25000.00") → digit rupiah ("25000"). Form hanya menerima rupiah penuh.
export function moneyDigits(value: string): string {
  return value.split(".")[0] ?? "";
}

// Input pengguna → digit saja, tanpa nol di depan, maks. 13 digit
export function sanitizeMoneyInput(value: string): string {
  return value.replace(/[^0-9]/g, "").replace(/^0+(?=[0-9])/, "").slice(0, 13);
}

// "1500000" → "1.500.000" (tampilan di input)
export function groupThousands(digits: string): string {
  return digits.replace(/\B(?=([0-9]{3})+(?![0-9]))/g, ".");
}

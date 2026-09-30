// Tanggal & sapaan untuk tampilan. Zona waktu sementara WIB untuk semua usaha —
// TODO(feature 09/13): pakai zona waktu dari kota usaha (mis. Makassar = WITA).
export const DEFAULT_TIME_ZONE = "Asia/Jakarta";

// "Senin, 30 September 2026"
export function formatLongDate(date: Date, timeZone: string = DEFAULT_TIME_ZONE): string {
  return new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone }).format(date);
}

// "Selamat pagi/siang/sore/malam" menurut jam di zona waktu usaha
export function greetingFor(date: Date, timeZone: string = DEFAULT_TIME_ZONE): string {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone }).format(date));
  if (hour < 11) return "Selamat pagi";
  if (hour < 15) return "Selamat siang";
  if (hour < 18) return "Selamat sore";
  return "Selamat malam";
}

export function firstNameOf(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? "";
}

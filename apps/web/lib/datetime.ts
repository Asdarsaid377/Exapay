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

// "30 September 2026"
export function formatDate(date: Date | string, timeZone: string = DEFAULT_TIME_ZONE): string {
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric", timeZone }).format(new Date(date));
}

// "30 Sep 2026"
export function formatShortDate(date: Date | string, timeZone: string = DEFAULT_TIME_ZONE): string {
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone }).format(new Date(date));
}

// "30 September 2026 pukul 14.05"
export function formatDateTime(date: Date | string, timeZone: string = DEFAULT_TIME_ZONE): string {
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone }).format(
    new Date(date),
  );
}

// Tanggal tanpa jam dari API (YYYY-MM-DD) — dibaca sebagai tanggal kalender, bukan waktu (tanpa geser zona waktu)
// "3 Feb 2024"
export function formatIsoDate(isoDate: string): string {
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${isoDate}T00:00:00Z`));
}

// Tanggal hari ini (YYYY-MM-DD) di zona waktu usaha
export function todayIso(timeZone: string = DEFAULT_TIME_ZONE): string {
  return new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone }).format(new Date());
}

// Selisih hari kalender dari → ke (keduanya YYYY-MM-DD)
export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / 86_400_000);
}

// Masa kerja "2 tahun 7 bulan" dari tanggal masuk sampai hari ini (atau tanggal keluar)
export function formatTenure(startIso: string, endIso: string): string {
  const [sy = 0, sm = 0, sd = 0] = startIso.split("-").map(Number);
  const [ey = 0, em = 0, ed = 0] = endIso.split("-").map(Number);
  let months = (ey - sy) * 12 + (em - sm) - (ed < sd ? 1 : 0);
  if (months < 0) return "Belum mulai bekerja";
  const years = Math.floor(months / 12);
  months %= 12;
  if (years === 0 && months === 0) return "Kurang dari 1 bulan";
  return [years ? `${years} tahun` : "", months ? `${months} bulan` : ""].filter(Boolean).join(" ");
}

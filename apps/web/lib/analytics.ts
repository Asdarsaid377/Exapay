// Event analitik halaman publik (Umami, components/landing/AnalyticsScript.tsx). Skrip tidak dimuat (env kosong, diblokir,
// atau di dalam aplikasi) → diam-diam tidak melakukan apa pun. Jangan kirim data pribadi sebagai nama/isi event.
type UmamiWindow = Window & { umami?: { track: (event: string) => void } };

export function trackEvent(name: string): void {
  try {
    (window as UmamiWindow).umami?.track(name);
  } catch {
    // Analitik tidak boleh mengganggu alur pengguna
  }
}

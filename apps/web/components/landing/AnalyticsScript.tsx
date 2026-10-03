// Analitik pengunjung halaman publik (permintaan user 2026-10-03): Umami self-hosted di VPS sendiri — tanpa cookie,
// tanpa pelacak pihak ketiga. Hanya dirender di landing, halaman legal & pendaftaran; TIDAK PERNAH di dalam aplikasi
// (URL & isi halaman aplikasi memuat data karyawan). Env runtime web: UMAMI_SCRIPT_URL + UMAMI_WEBSITE_ID; kosong → tanpa skrip.
// Event klik: atribut data-umami-event pada tombol "Coba gratis" & tautan WhatsApp.
export function AnalyticsScript() {
  const src = process.env.UMAMI_SCRIPT_URL;
  const websiteId = process.env.UMAMI_WEBSITE_ID;
  if (!src || !websiteId) return null;
  return <script defer src={src} data-website-id={websiteId} data-do-not-track="true" />;
}

// URL publik situs (env APP_WEB_URL, mis. https://app.contoh.co.id) untuk canonical, Open Graph, sitemap & robots
// landing page (feature 43). Dibaca saat request — bukan saat build — karena domain production hanya ada di env runtime.
const FALLBACK_SITE_URL = "http://localhost:3000";

export function siteUrl(): URL {
  const raw = process.env.APP_WEB_URL;
  try {
    return new URL(raw && raw.length > 0 ? raw : FALLBACK_SITE_URL);
  } catch {
    console.error(`[web/siteUrl] APP_WEB_URL tidak valid: ${raw ?? ""}`);
    return new URL(FALLBACK_SITE_URL);
  }
}

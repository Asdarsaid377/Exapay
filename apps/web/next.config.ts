import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";

import type { NextConfig } from "next";

// Dev lokal: ambil HANYA variabel yang dibutuhkan web dari .env root monorepo — secret API/DB tidak ikut
// dimuat ke proses Next. Di Docker, env diberikan docker-compose (nilai proses diutamakan).
// APP_WEB_URL: URL publik situs — canonical, Open Graph, sitemap & robots landing page (feature 43)
// UMAMI_*: analitik halaman publik (opsional, components/landing/AnalyticsScript.tsx)
const WEB_ENV_KEYS = ["API_INTERNAL_URL", "APP_WEB_URL", "UMAMI_SCRIPT_URL", "UMAMI_WEBSITE_ID"] as const;

try {
  const rootEnv = parseEnv(readFileSync("../../.env", "utf8"));
  for (const key of WEB_ENV_KEYS) {
    const value = rootEnv[key];
    if (value && !process.env[key]) process.env[key] = value;
  }
} catch {
  // Tidak ada .env — pakai env dari proses
}

const nextConfig: NextConfig = {
  // Dev saja: uji dari HP lewat tunnel HTTPS (kamera/GPS butuh secure context)
  allowedDevOrigins: ["card.solvexaerp.tech"],
  // Image production (docker/production/Dockerfile) memakai server standalone. Dev & `next start` tetap biasa.
  ...(process.env.NEXT_OUTPUT_STANDALONE === "1"
    ? { output: "standalone" as const, outputFileTracingRoot: fileURLToPath(new URL("../../", import.meta.url)) }
    : {}),
  experimental: {
    // Upload lewat Server Action: impor karyawan (maks 1 MB) & lampiran izin (maks 5 MB, LEAVE_ATTACHMENT_MAX_BYTES)
    // + overhead multipart — bawaan Next 1 MB
    // Dev: tunnel bisa meneruskan Host "localhost:3000" sementara Origin "card.solvexaerp.tech" → Server Action ditolak (CSRF)
    serverActions: { bodySizeLimit: "6mb", ...(process.env.NODE_ENV === "production" ? {} : { allowedOrigins: ["card.solvexaerp.tech"] }) },
    
  },
  // Service worker PWA (feature 37) selalu diambil ulang agar pembaruan langsung berlaku (panduan PWA Next.js)
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
        ],
      },
    ];
  },
};

export default nextConfig;

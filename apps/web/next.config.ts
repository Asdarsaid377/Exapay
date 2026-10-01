import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";

import type { NextConfig } from "next";

// Dev lokal: ambil HANYA variabel yang dibutuhkan web dari .env root monorepo — secret API/DB tidak ikut
// dimuat ke proses Next. Di Docker, env diberikan docker-compose (nilai proses diutamakan).
const WEB_ENV_KEYS = ["API_INTERNAL_URL"] as const;

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
  experimental: {
    // Upload lewat Server Action: impor karyawan (maks 1 MB) & lampiran izin (maks 5 MB, LEAVE_ATTACHMENT_MAX_BYTES)
    // + overhead multipart — bawaan Next 1 MB
    serverActions: { bodySizeLimit: "6mb" },
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

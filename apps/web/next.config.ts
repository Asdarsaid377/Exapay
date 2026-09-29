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

const nextConfig: NextConfig = {};

export default nextConfig;

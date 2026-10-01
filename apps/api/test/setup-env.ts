import { fileURLToPath } from "node:url";

import { inject } from "vitest";

// Dijalankan di setiap worker sebelum file test: env dari .env, lalu DATABASE_URL diarahkan ke database test
try {
  process.loadEnvFile(fileURLToPath(new URL("../../../.env", import.meta.url)));
} catch {
  // Tidak ada .env — pakai env dari proses
}
process.env.DATABASE_URL = inject("testDatabaseUrl");
process.env.NODE_ENV = "test";
// Antrean test (BullMQ, feature 23) di database Redis terpisah agar tidak diambil worker dev yang sedang berjalan
if (process.env.REDIS_URL) {
  const redisUrl = new URL(process.env.REDIS_URL);
  redisUrl.pathname = "/15";
  process.env.REDIS_URL = redisUrl.toString();
}

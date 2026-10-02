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
// QRIS merchant contoh (fiktif, CRC benar — sama dengan test/qris.test.ts) agar tagihan feature 41 bisa menampilkan QR
process.env.QRIS_STATIC_PAYLOAD =
  "00020101021126390013ID.EXAPAY.WWW011893600899000000000151660014ID.CO.QRIS.WWW01189360089900000000010215ID20240000000010303UMI5204581253033605802ID5913EXAPAY CONTOH6008MAKASSAR61059011162070703A0163045BBB";

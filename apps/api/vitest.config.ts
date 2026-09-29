import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    // Membuat database exapayroll_test terpisah + menjalankan migration sebelum test
    globalSetup: ["test/global-setup.ts"],
    setupFiles: ["test/setup-env.ts"],
    // File test berbagi satu database test — jalankan berurutan agar data tidak saling mengganggu
    fileParallelism: false,
    testTimeout: 15_000,
    hookTimeout: 60_000,
  },
});

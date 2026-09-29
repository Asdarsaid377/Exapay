import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    // Membuat database exapayroll_test terpisah + menjalankan migration sebelum test
    globalSetup: ["test/global-setup.ts"],
    testTimeout: 15_000,
    hookTimeout: 60_000,
  },
});

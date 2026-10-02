import { defineConfig } from "vitest/config";

// Test DB worker (pengingat langganan, feature 40) memakai globalSetup API (migration + role) dengan database sendiri,
// agar tidak saling drop dengan test API yang dijalankan turbo bersamaan.
process.env.EXAPAY_TEST_DB = "exapayroll_worker_test";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    globalSetup: ["../api/test/global-setup.ts"],
    fileParallelism: false,
    testTimeout: 15_000,
    hookTimeout: 60_000,
  },
});

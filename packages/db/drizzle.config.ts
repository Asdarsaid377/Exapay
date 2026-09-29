import { defineConfig } from "drizzle-kit";

// drizzle-kit tidak membaca .env sendiri. Dijalankan dari packages/db (pnpm --filter), jadi .env ada di ../../
try {
  process.loadEnvFile("../../.env");
} catch {
  // Tidak ada .env (CI/container) — pakai env dari proses
}

const url = process.env.DATABASE_MIGRATION_URL;
if (!url) {
  throw new Error("DATABASE_MIGRATION_URL belum di-set (role app_owner, hanya untuk migration)");
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema.ts",
  out: "./migrations",
  dbCredentials: { url },
  migrations: { schema: "drizzle", table: "__drizzle_migrations" },
  strict: true,
  verbose: true,
});

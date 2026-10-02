import { fileURLToPath } from "node:url";

import { drizzle } from "drizzle-orm/node-postgres";
import { Redis } from "ioredis";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import type { TestProject } from "vitest/node";

// Test integrasi memakai database terpisah agar data dev tidak tersentuh.
// Hanya database bernama TEST_DB ini yang di-drop/create.
const TEST_DB = "exapayroll_test";
const MIGRATIONS_FOLDER = fileURLToPath(new URL("../../../packages/db/migrations", import.meta.url));

declare module "vitest" {
  export interface ProvidedContext {
    // Role app_user (runtime API) — dipakai hampir semua test
    testDatabaseUrl: string;
    // Role app_owner — hanya untuk seed yang memang butuh owner (mis. flag super-admin)
    testOwnerDatabaseUrl: string;
  }
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`[test/setup] env ${name} belum di-set (lihat .env.example)`);
  }
  return value;
}

function withDatabase(url: string, database: string, credentials?: { user: string; password: string }): string {
  const parsed = new URL(url);
  parsed.pathname = `/${database}`;
  if (credentials) {
    parsed.username = encodeURIComponent(credentials.user);
    parsed.password = encodeURIComponent(credentials.password);
  }
  return parsed.toString();
}

async function runAsSuperuser(url: string, statements: string[]): Promise<void> {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    for (const statement of statements) {
      await client.query(statement);
    }
  } finally {
    await client.end();
  }
}

export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  try {
    process.loadEnvFile(fileURLToPath(new URL("../../../.env", import.meta.url)));
  } catch {
    // Tidak ada .env — pakai env dari proses
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("[test/setup] test integrasi tidak boleh dijalankan dengan NODE_ENV=production");
  }

  // Redis DB 15 khusus test (lihat setup-env.ts): kosongkan sisa job antrean & hitungan rate limit (feature 38) run sebelumnya
  const redisUrl = new URL(requireEnv("REDIS_URL"));
  redisUrl.pathname = "/15";
  const redis = new Redis(redisUrl.toString());
  try {
    await redis.flushdb();
  } finally {
    await redis.quit();
  }

  const migrationUrl = requireEnv("DATABASE_MIGRATION_URL");
  const appUrl = requireEnv("DATABASE_URL");
  const superuser = { user: requireEnv("POSTGRES_USER"), password: requireEnv("POSTGRES_PASSWORD") };

  const superuserMaintenanceUrl = withDatabase(migrationUrl, "postgres", superuser);
  const superuserTestUrl = withDatabase(migrationUrl, TEST_DB, superuser);

  // Meniru docker/postgres/init/01-roles.sh untuk database test
  await runAsSuperuser(superuserMaintenanceUrl, [
    `drop database if exists ${TEST_DB} with (force)`,
    `create database ${TEST_DB} owner app_owner`,
    `revoke all on database ${TEST_DB} from public`,
    `grant connect on database ${TEST_DB} to app_owner, app_user`,
  ]);
  await runAsSuperuser(superuserTestUrl, [
    "alter schema public owner to app_owner",
    "grant usage on schema public to app_user",
  ]);

  // Migration dijalankan sebagai app_owner — sama seperti di environment nyata
  const ownerPool = new pg.Pool({ connectionString: withDatabase(migrationUrl, TEST_DB) });
  try {
    await migrate(drizzle({ client: ownerPool }), {
      migrationsFolder: MIGRATIONS_FOLDER,
      migrationsSchema: "drizzle",
      migrationsTable: "__drizzle_migrations",
    });
  } finally {
    await ownerPool.end();
  }

  project.provide("testDatabaseUrl", withDatabase(appUrl, TEST_DB));
  project.provide("testOwnerDatabaseUrl", withDatabase(migrationUrl, TEST_DB));

  return async (): Promise<void> => {
    await runAsSuperuser(superuserMaintenanceUrl, [`drop database if exists ${TEST_DB} with (force)`]);
  };
}

import * as schema from "@exapay/db";
import { Global, Inject, Module, type OnApplicationShutdown } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";

import type { Env } from "../common/config/env.js";
import type { Database } from "./tenant-transaction.js";

export const PG_POOL = Symbol("PG_POOL");
export const DRIZZLE = Symbol("DRIZZLE");

// Koneksi Postgres (role runtime app_user, bukan owner tabel → RLS berlaku).
// Query data tenant wajib lewat withTenant() dari ./tenant-transaction.ts.
@Global()
@Module({
  providers: [
    {
      provide: PG_POOL,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>): pg.Pool =>
        new pg.Pool({ connectionString: config.get("DATABASE_URL", { infer: true }) }),
    },
    {
      provide: DRIZZLE,
      inject: [PG_POOL],
      useFactory: (pool: pg.Pool): Database => drizzle({ client: pool, schema }),
    },
  ],
  exports: [PG_POOL, DRIZZLE],
})
export class DatabaseModule implements OnApplicationShutdown {
  constructor(@Inject(PG_POOL) private readonly pool: pg.Pool) {}

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}

import { Global, Inject, Module, type OnApplicationShutdown } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import pg from "pg";

import type { Env } from "../common/config/env.js";

export const PG_POOL = Symbol("PG_POOL");

// Koneksi Postgres (role runtime app_user). Helper transaksi ber-tenant ditambahkan di feature 02.
@Global()
@Module({
  providers: [
    {
      provide: PG_POOL,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>): pg.Pool =>
        new pg.Pool({ connectionString: config.get("DATABASE_URL", { infer: true }) }),
    },
  ],
  exports: [PG_POOL],
})
export class DatabaseModule implements OnApplicationShutdown {
  constructor(@Inject(PG_POOL) private readonly pool: pg.Pool) {}

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}

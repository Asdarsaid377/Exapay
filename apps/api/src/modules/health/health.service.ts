import { Inject, Injectable, Logger } from "@nestjs/common";
import { Redis } from "ioredis";
import pg from "pg";

import { PG_POOL } from "../../database/database.module.js";
import { REDIS_CLIENT } from "../../redis/redis.module.js";

export type DependencyStatus = "up" | "down";

export type HealthReport = {
  status: "ok" | "degraded";
  checks: {
    database: DependencyStatus;
    redis: DependencyStatus;
  };
};

const CHECK_TIMEOUT_MS = 2000;

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(
    @Inject(PG_POOL) private readonly pool: pg.Pool,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async check(): Promise<HealthReport> {
    const [database, redis] = await Promise.all([
      this.probe("database", async () => {
        await this.pool.query("select 1");
      }),
      this.probe("redis", async () => {
        await this.redis.ping();
      }),
    ]);

    return {
      status: database === "up" && redis === "up" ? "ok" : "degraded",
      checks: { database, redis },
    };
  }

  private async probe(name: string, fn: () => Promise<void>): Promise<DependencyStatus> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`timeout ${CHECK_TIMEOUT_MS}ms`)), CHECK_TIMEOUT_MS);
    });

    try {
      await Promise.race([fn(), timeout]);
      return "up";
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`[health/check] ${name} down: ${message}`);
      return "down";
    } finally {
      clearTimeout(timer);
    }
  }
}

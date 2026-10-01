import { AI_QUEUE_NAME, type AiJobData } from "@exapay/shared";
import { Global, Inject, Module, type OnApplicationShutdown } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Queue } from "bullmq";
import { Redis } from "ioredis";

import type { Env } from "../common/config/env.js";

export const REDIS_CLIENT = Symbol("REDIS_CLIENT");
// Antrean BullMQ "ai" (feature 23) — API hanya menambah job; diproses apps/worker
export const AI_QUEUE = Symbol("AI_QUEUE");

const AI_QUEUE_CONNECTION = Symbol("AI_QUEUE_CONNECTION");

export type AiQueue = Queue<AiJobData>;

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>): Redis =>
        new Redis(config.get("REDIS_URL", { infer: true }), {
          // Jangan menahan request saat Redis mati — health check harus cepat melapor "down"
          maxRetriesPerRequest: 1,
          enableOfflineQueue: false,
        }),
    },
    {
      // Koneksi sendiri untuk produsen; gagal cepat saat Redis mati agar request tidak menggantung
      provide: AI_QUEUE_CONNECTION,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>): Redis =>
        new Redis(config.get("REDIS_URL", { infer: true }), { maxRetriesPerRequest: 1, enableOfflineQueue: false }),
    },
    {
      provide: AI_QUEUE,
      inject: [AI_QUEUE_CONNECTION],
      useFactory: (connection: Redis): AiQueue =>
        new Queue<AiJobData>(AI_QUEUE_NAME, {
          connection,
          defaultJobOptions: {
            attempts: 3,
            backoff: { type: "exponential", delay: 15_000 },
            removeOnComplete: { age: 24 * 3600 },
            removeOnFail: { age: 7 * 24 * 3600 },
          },
        }),
    },
  ],
  exports: [REDIS_CLIENT, AI_QUEUE],
})
export class RedisModule implements OnApplicationShutdown {
  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @Inject(AI_QUEUE) private readonly aiQueue: AiQueue,
    @Inject(AI_QUEUE_CONNECTION) private readonly aiQueueConnection: Redis,
  ) {}

  async onApplicationShutdown(): Promise<void> {
    // Koneksi yang diberikan ke Queue dianggap "shared" oleh BullMQ → tidak ditutup close(); tutup sendiri
    await this.aiQueue.close();
    await this.aiQueueConnection.quit();
    await this.redis.quit();
  }
}

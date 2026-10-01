import { Inject, Logger, Module, type OnApplicationBootstrap, type OnApplicationShutdown } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { Redis } from "ioredis";

import { AiProvider } from "./ai/ai-provider.js";
import { AnthropicAiProvider } from "./ai/anthropic-ai-provider.js";
import { FakeAiProvider } from "./ai/fake-ai-provider.js";
import { type Env, envSchema } from "./config/env.js";
import { DatabaseModule } from "./database/database.module.js";
import { KpiReviewSummaryProcessor } from "./processors/kpi-review-summary.processor.js";

const REDIS_CLIENT = Symbol("REDIS_CLIENT");

// Processor BullMQ: ringkasan AI penilaian KPI (feature 23). pdf, whatsapp, erp-sync didaftarkan di sini pada feature terkait.
@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true, validationSchema: envSchema }), DatabaseModule],
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>): Redis =>
        new Redis(config.get("REDIS_URL", { infer: true }), { maxRetriesPerRequest: null }),
    },
    {
      // Lapisan abstraksi provider AI: Claude jika ANTHROPIC_API_KEY terisi, provider palsu untuk development
      provide: AiProvider,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>): AiProvider => {
        const apiKey = config.get("ANTHROPIC_API_KEY", { infer: true });
        return apiKey ? new AnthropicAiProvider(apiKey, config.get("AI_MODEL", { infer: true })) : new FakeAiProvider();
      },
    },
    KpiReviewSummaryProcessor,
  ],
})
export class WorkerModule implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(WorkerModule.name);

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.redis.ping();
    this.logger.log("Worker siap — terhubung ke Redis");
  }

  async onApplicationShutdown(): Promise<void> {
    await this.redis.quit();
  }
}

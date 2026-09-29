import { Inject, Logger, Module, type OnApplicationBootstrap, type OnApplicationShutdown } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { Redis } from "ioredis";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  REDIS_URL: z.string().min(1),
});

type Env = z.infer<typeof envSchema>;

const REDIS_CLIENT = Symbol("REDIS_CLIENT");

// Processor BullMQ (pdf, ai-summary, whatsapp, erp-sync) didaftarkan di sini pada feature terkait.
@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true, validationSchema: envSchema })],
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>): Redis =>
        new Redis(config.get("REDIS_URL", { infer: true }), { maxRetriesPerRequest: null }),
    },
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

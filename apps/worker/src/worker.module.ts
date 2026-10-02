import { Inject, Logger, Module, type OnApplicationBootstrap, type OnApplicationShutdown } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { Redis } from "ioredis";

import { AiProvider } from "./ai/ai-provider.js";
import { AnthropicAiProvider } from "./ai/anthropic-ai-provider.js";
import { FakeAiProvider } from "./ai/fake-ai-provider.js";
import { type Env, envSchema } from "./config/env.js";
import { DatabaseModule } from "./database/database.module.js";
import { Mailer, SmtpMailer } from "./email/mailer.js";
import { AttendanceSelfieProcessor } from "./processors/attendance-selfie.processor.js";
import { BillingInvoices } from "./processors/billing-invoices.js";
import { BillingNoticeProcessor } from "./processors/billing-notice.processor.js";
import { ComplianceProcessor } from "./processors/compliance.processor.js";
import { KpiReviewSummaryProcessor } from "./processors/kpi-review-summary.processor.js";
import { PayslipProcessor } from "./processors/payslip.processor.js";
import { RosterNoticeProcessor } from "./processors/roster-notice.processor.js";
import { FileStorage, S3FileStorage } from "./storage/file-storage.js";

const REDIS_CLIENT = Symbol("REDIS_CLIENT");

// Processor BullMQ: ringkasan AI penilaian KPI (feature 23), slip gaji PDF + email (feature 31), email pengingat
// kalender kepatuhan terjadwal (feature 33), email pengingat langganan terjadwal (feature 40), tagihan langganan &
// pemberitahuan klaim bayar (feature 41), penghapusan selfie absen > 90 hari (feature 45), email perubahan roster shift (feature 46). whatsapp, erp-sync
// didaftarkan di sini pada feature terkait.
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
    {
      provide: FileStorage,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>): FileStorage =>
        new S3FileStorage({
          endpoint: config.get("S3_ENDPOINT", { infer: true }),
          region: config.get("S3_REGION", { infer: true }),
          bucket: config.get("S3_BUCKET", { infer: true }),
          accessKeyId: config.get("S3_ACCESS_KEY_ID", { infer: true }),
          secretAccessKey: config.get("S3_SECRET_ACCESS_KEY", { infer: true }),
        }),
    },
    {
      provide: Mailer,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>): Mailer =>
        new SmtpMailer({
          host: config.get("SMTP_HOST", { infer: true }),
          port: config.get("SMTP_PORT", { infer: true }),
          user: config.get("SMTP_USER", { infer: true }),
          password: config.get("SMTP_PASSWORD", { infer: true }),
          from: config.get("SMTP_FROM", { infer: true }),
          requireTls: config.get("NODE_ENV", { infer: true }) === "production",
        }),
    },
    KpiReviewSummaryProcessor,
    PayslipProcessor,
    ComplianceProcessor,
    BillingInvoices,
    BillingNoticeProcessor,
    AttendanceSelfieProcessor,
    RosterNoticeProcessor,
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

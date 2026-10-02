import {
  AI_QUEUE_NAME,
  type AiJobData,
  BILLING_QUEUE_NAME,
  type BillingClaimNotifyJobData,
  PAYSLIP_QUEUE_NAME,
  type PayslipJobData,
  ROSTER_QUEUE_NAME,
  type RosterNotifyJobData,
} from "@exapay/shared";
import { Global, Inject, Module, type OnApplicationShutdown } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Queue } from "bullmq";
import { Redis } from "ioredis";

import type { Env } from "../common/config/env.js";

export const REDIS_CLIENT = Symbol("REDIS_CLIENT");
// Antrean BullMQ "ai" (feature 23) — API hanya menambah job; diproses apps/worker
export const AI_QUEUE = Symbol("AI_QUEUE");
// Antrean BullMQ "payslips" (feature 31) — buat PDF slip & email pemberitahuan; diproses apps/worker
export const PAYSLIP_QUEUE = Symbol("PAYSLIP_QUEUE");
// Antrean BullMQ "billing" (feature 41) — API hanya menambah job pemberitahuan klaim bayar; pemindaian harian
// (tagihan & pengingat) dijadwalkan worker sendiri
export const BILLING_QUEUE = Symbol("BILLING_QUEUE");
// Antrean BullMQ "roster" (feature 46) — email pemberitahuan perubahan jadwal shift ke karyawan
export const ROSTER_QUEUE = Symbol("ROSTER_QUEUE");

const QUEUE_CONNECTION = Symbol("QUEUE_CONNECTION");

export type AiQueue = Queue<AiJobData>;
export type PayslipQueue = Queue<PayslipJobData>;
export type BillingQueue = Queue<BillingClaimNotifyJobData>;
export type RosterQueue = Queue<RosterNotifyJobData>;

const DEFAULT_JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: "exponential", delay: 15_000 },
  removeOnComplete: { age: 24 * 3600 },
  removeOnFail: { age: 7 * 24 * 3600 },
};

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
      // Koneksi sendiri untuk produsen (dipakai bersama semua antrean); gagal cepat saat Redis mati agar request tidak menggantung
      provide: QUEUE_CONNECTION,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>): Redis =>
        new Redis(config.get("REDIS_URL", { infer: true }), { maxRetriesPerRequest: 1, enableOfflineQueue: false }),
    },
    {
      provide: AI_QUEUE,
      inject: [QUEUE_CONNECTION],
      useFactory: (connection: Redis): AiQueue => new Queue<AiJobData>(AI_QUEUE_NAME, { connection, defaultJobOptions: DEFAULT_JOB_OPTIONS }),
    },
    {
      provide: PAYSLIP_QUEUE,
      inject: [QUEUE_CONNECTION],
      useFactory: (connection: Redis): PayslipQueue =>
        new Queue<PayslipJobData>(PAYSLIP_QUEUE_NAME, { connection, defaultJobOptions: DEFAULT_JOB_OPTIONS }),
    },
    {
      provide: BILLING_QUEUE,
      inject: [QUEUE_CONNECTION],
      useFactory: (connection: Redis): BillingQueue =>
        new Queue<BillingClaimNotifyJobData>(BILLING_QUEUE_NAME, { connection, defaultJobOptions: DEFAULT_JOB_OPTIONS }),
    },
    {
      provide: ROSTER_QUEUE,
      inject: [QUEUE_CONNECTION],
      useFactory: (connection: Redis): RosterQueue =>
        new Queue<RosterNotifyJobData>(ROSTER_QUEUE_NAME, { connection, defaultJobOptions: DEFAULT_JOB_OPTIONS }),
    },
  ],
  exports: [REDIS_CLIENT, AI_QUEUE, PAYSLIP_QUEUE, BILLING_QUEUE, ROSTER_QUEUE],
})
export class RedisModule implements OnApplicationShutdown {
  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @Inject(AI_QUEUE) private readonly aiQueue: AiQueue,
    @Inject(PAYSLIP_QUEUE) private readonly payslipQueue: PayslipQueue,
    @Inject(BILLING_QUEUE) private readonly billingQueue: BillingQueue,
    @Inject(ROSTER_QUEUE) private readonly rosterQueue: RosterQueue,
    @Inject(QUEUE_CONNECTION) private readonly queueConnection: Redis,
  ) {}

  async onApplicationShutdown(): Promise<void> {
    // Koneksi yang diberikan ke Queue dianggap "shared" oleh BullMQ → tidak ditutup close(); tutup sendiri
    await this.aiQueue.close();
    await this.payslipQueue.close();
    await this.billingQueue.close();
    await this.rosterQueue.close();
    await this.queueConnection.quit();
    await this.redis.quit();
  }
}

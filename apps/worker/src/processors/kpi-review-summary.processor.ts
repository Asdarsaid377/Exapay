import { aiGenerations, type Database, kpiReviews, kpiReviewSummaries, type TenantContext, withTenant } from "@exapay/db";
import { AI_QUEUE_NAME, type AiJobData, aiJobDataSchema, KPI_REVIEW_SUMMARY_JOB, KPI_SUMMARY_MAX_LENGTH, kpiSummaryInputSchema } from "@exapay/shared";
import { Inject, Injectable, Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { type Job, UnrecoverableError, Worker } from "bullmq";
import { eq, sql } from "drizzle-orm";
import { Redis } from "ioredis";

import { AiProvider, AiProviderError } from "../ai/ai-provider.js";
import {
  buildKpiReviewSummaryPrompt,
  cleanKpiReviewSummary,
  KPI_REVIEW_SUMMARY_MAX_TOKENS,
  KPI_REVIEW_SUMMARY_PROMPT_VERSION,
  KPI_REVIEW_SUMMARY_SYSTEM,
} from "../ai/kpi-review-summary.prompt.js";
import type { Env } from "../config/env.js";
import { DRIZZLE } from "../database/database.module.js";

const GENERIC_ERROR = "Ringkasan AI gagal dibuat. Silakan coba buat ulang.";

// Konsumen antrean "ai" job kpi-review-summary (feature 23). Alur per job (tenant dari payload, RLS berlaku):
// 1. klaim generasi queued/running → running (idempoten: generasi yang sudah selesai/gagal dilewati)
// 2. panggil provider AI di luar transaksi
// 3. simpan output + model + versi prompt + token; pasang ke narasi HANYA jika masih generasi terakhir yang diminta dan
//    penilaian belum final (baris penilaian & narasi dikunci — urutan kunci sama dengan finalisasi di API)
// Gagal sementara → dicoba ulang BullMQ (attempts/backoff dari API); percobaan terakhir / gagal permanen → status failed.
@Injectable()
export class KpiReviewSummaryProcessor implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(KpiReviewSummaryProcessor.name);
  private worker: Worker<AiJobData> | null = null;
  private connection: Redis | null = null;

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly ai: AiProvider,
    private readonly config: ConfigService<Env, true>,
  ) {}

  onApplicationBootstrap(): void {
    // BullMQ Worker wajib koneksi dengan maxRetriesPerRequest: null (perintah blocking)
    this.connection = new Redis(this.config.get("REDIS_URL", { infer: true }), { maxRetriesPerRequest: null });
    this.worker = new Worker<AiJobData>(AI_QUEUE_NAME, (job) => this.process(job), { connection: this.connection, concurrency: 2 });
    this.worker.on("failed", (job, error) => this.logger.warn(`[ai/kpi-review-summary] job ${job?.id ?? "?"} gagal: ${error.message}`));
    this.logger.log(`Memproses antrean "${AI_QUEUE_NAME}" dengan provider AI ${this.ai.name}`);
  }

  async onApplicationShutdown(): Promise<void> {
    await this.worker?.close();
    await this.connection?.quit();
  }

  async process(job: Job<AiJobData>): Promise<void> {
    if (job.name !== KPI_REVIEW_SUMMARY_JOB) throw new UnrecoverableError(`job tidak dikenal: ${job.name}`);
    const data = aiJobDataSchema.safeParse(job.data);
    if (!data.success) throw new UnrecoverableError("payload job tidak valid");
    const ctx: TenantContext = { tenantId: data.data.tenantId, userId: null };
    const { generationId } = data.data;

    const claimed = await withTenant(this.db, ctx, async (tx) => {
      const [generation] = await tx
        .select({ status: aiGenerations.status, input: aiGenerations.input })
        .from(aiGenerations)
        .where(eq(aiGenerations.id, generationId))
        .for("update");
      if (!generation || (generation.status !== "queued" && generation.status !== "running")) return null;
      await tx
        .update(aiGenerations)
        .set({ status: "running", startedAt: new Date(), attempts: sql`${aiGenerations.attempts} + 1` })
        .where(eq(aiGenerations.id, generationId));
      return generation.input;
    });
    if (claimed === null) {
      this.logger.log(`[ai/kpi-review-summary] generasi ${generationId} sudah selesai/dibatalkan — dilewati`);
      return;
    }

    const input = kpiSummaryInputSchema.safeParse(claimed);
    if (!input.success) {
      await this.markFailed(ctx, generationId, GENERIC_ERROR);
      throw new UnrecoverableError(`input generasi ${generationId} tidak valid`);
    }

    let result;
    try {
      const raw = await this.ai.generateText({
        system: KPI_REVIEW_SUMMARY_SYSTEM,
        prompt: buildKpiReviewSummaryPrompt(input.data),
        maxTokens: KPI_REVIEW_SUMMARY_MAX_TOKENS,
      });
      result = { ...raw, text: cleanKpiReviewSummary(raw.text) };
      if (!result.text) throw new AiProviderError("[ai/kpi-review-summary] output kosong setelah dibersihkan", "AI tidak mengembalikan ringkasan. Silakan coba buat ulang.", false);
      if (result.text.length > KPI_SUMMARY_MAX_LENGTH) {
        throw new AiProviderError(`[ai/kpi-review-summary] output ${result.text.length} karakter`, "Ringkasan AI terlalu panjang. Silakan coba buat ulang.", false);
      }
    } catch (error) {
      const permanent = error instanceof AiProviderError && error.permanent;
      const lastAttempt = permanent || job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
      this.logger.error(`[ai/kpi-review-summary] generasi ${generationId} percobaan ${job.attemptsMade + 1}: ${error instanceof Error ? error.message : String(error)}`);
      if (!lastAttempt) throw error;
      await this.markFailed(ctx, generationId, error instanceof AiProviderError ? error.userMessage : GENERIC_ERROR);
      throw new UnrecoverableError(error instanceof Error ? error.message : String(error));
    }

    const applied = await withTenant(this.db, ctx, async (tx) => {
      const [target] = await tx.select({ reviewId: aiGenerations.reviewId }).from(aiGenerations).where(eq(aiGenerations.id, generationId));
      if (!target) return false;
      // Kunci penilaian dulu (urutan sama dengan API), baru baca ulang status generasi di bawah kunci
      const [review] = await tx.select({ status: kpiReviews.status }).from(kpiReviews).where(eq(kpiReviews.id, target.reviewId)).for("update");
      const [generation] = await tx
        .select({ status: aiGenerations.status, reviewId: aiGenerations.reviewId })
        .from(aiGenerations)
        .where(eq(aiGenerations.id, generationId))
        .for("update");
      // Ditandai gagal (macet) oleh API selagi diproses → hasil dibuang
      if (!generation || generation.status !== "running") return false;
      await tx
        .update(aiGenerations)
        .set({
          status: "succeeded",
          output: result.text,
          error: null,
          provider: this.ai.name,
          model: result.model,
          promptVersion: KPI_REVIEW_SUMMARY_PROMPT_VERSION,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          completedAt: new Date(),
        })
        .where(eq(aiGenerations.id, generationId));
      if (!review || review.status === "final") return false;
      const [summary] = await tx
        .select({ generationId: kpiReviewSummaries.generationId })
        .from(kpiReviewSummaries)
        .where(eq(kpiReviewSummaries.reviewId, generation.reviewId))
        .for("update");
      if (summary?.generationId !== generationId) return false;
      // Narasi AI baru = belum ditinjau
      await tx
        .update(kpiReviewSummaries)
        .set({ body: result.text, source: "ai", reviewedAt: null, reviewedByUserId: null, reviewedByName: null })
        .where(eq(kpiReviewSummaries.reviewId, generation.reviewId));
      return true;
    });
    this.logger.log(`[ai/kpi-review-summary] generasi ${generationId} selesai (${result.model})${applied ? "" : " — tidak dipasang (bukan generasi terakhir / sudah final)"}`);
  }

  private async markFailed(ctx: TenantContext, generationId: string, message: string): Promise<void> {
    await withTenant(this.db, ctx, async (tx) => {
      await tx
        .update(aiGenerations)
        .set({ status: "failed", error: message, output: null, completedAt: new Date() })
        .where(sql`${aiGenerations.id} = ${generationId} AND ${aiGenerations.status} IN ('queued', 'running')`);
    });
  }
}

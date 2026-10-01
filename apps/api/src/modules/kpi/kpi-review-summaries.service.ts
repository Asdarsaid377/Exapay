import { aiGenerations, kpiReviewSummaries } from "@exapay/db";
import {
  KPI_REVIEW_SUMMARY_JOB,
  type KpiReviewSummaryEditInput,
  type KpiReviewSummaryGenerateInput,
  type KpiReviewSummaryReviewInput,
  type KpiSummarySource,
} from "@exapay/shared";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from "@nestjs/common";
import { eq, sql } from "drizzle-orm";

import { type AuthUser, tenantContextOf } from "../../common/auth/auth-user.js";
import { DRIZZLE } from "../../database/database.module.js";
import { type Database, type TenantContext, type Transaction, withTenant } from "../../database/tenant-transaction.js";
import { AI_QUEUE, type AiQueue } from "../../redis/redis.module.js";
import { type AttendanceViewer } from "../attendance/attendance-viewer.js";
import { AuditService } from "../audit/audit.service.js";
import {
  buildSummaryInput,
  canWriteSummary,
  generationPending,
  loadSummary,
  NO_SUMMARY_VERSION,
  type SummaryRecord,
  summaryQuota,
} from "./kpi-review-summary.js";
import { KpiReviewsService, type ReviewRecord } from "./kpi-reviews.service.js";

const CHANGED = "Ringkasan ini baru saja diubah pengguna lain. Muat ulang halaman lalu periksa lagi.";
const PENDING = "Ringkasan AI sedang dibuat. Tunggu sampai selesai.";
const STALE_ERROR = "Pembuatan ringkasan tidak selesai (waktu proses habis). Silakan buat ulang.";
const QUEUE_DOWN = "Layanan ringkasan AI sedang tidak tersedia. Coba lagi beberapa saat lagi.";

const MONTHS = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

type Locked = { review: ReviewRecord; viewer: AttendanceViewer; summary: SummaryRecord | null };

// Ringkasan AI / narasi kinerja penilaian KPI (feature 23). Penulis narasi = penilai (draft: atasan langsung + owner/admin;
// direview: owner/admin), bukan penilaian sendiri. Generate: input terstruktur tanpa identitas → ai_generations (queued) →
// job BullMQ diproses apps/worker. Edit / tulis sendiri / tandai ditinjau = narasi sudah ditinjau (syarat final bila ada).
// Semua mutasi diaudit (entity kpi_review_summary).
@Injectable()
export class KpiReviewSummariesService {
  private readonly logger = new Logger(KpiReviewSummariesService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(AI_QUEUE) private readonly queue: AiQueue,
    private readonly reviews: KpiReviewsService,
    private readonly audit: AuditService,
  ) {}

  async generate(user: AuthUser, id: string, input: KpiReviewSummaryGenerateInput): Promise<void> {
    const ctx = tenantContextOf(user);
    const generationId = await withTenant(this.db, ctx, async (tx) => {
      const viewer = await this.reviews.requireViewer(tx, ctx);
      const { review, scored, pendingTaskLogs, today, timeZone } = await this.reviews.lockForSummary(tx, ctx, viewer, id);
      this.requireWriter(viewer, review, scored.template !== null);
      if (!scored.template || !scored.result) throw new BadRequestException("Jabatan karyawan ini belum memakai template KPI.");
      const summary = await this.lockSummary(tx, review.id, input.version);

      // Kuota per usaha: kunci advisory agar dua permintaan bersamaan tidak sama-sama lolos di sisa kuota terakhir
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`ai-quota:${ctx.tenantId}`}, 0))`);
      const quota = await summaryQuota(tx, ctx.tenantId, today, timeZone);
      if (quota.used >= quota.limit) {
        const [year, month] = quota.resetsOn.split("-").map(Number);
        throw new HttpException(
          `Kuota ringkasan AI bulan ini sudah habis (${quota.used}/${quota.limit}). Kuota terisi lagi 1 ${MONTHS[(month ?? 1) - 1]} ${year}. Anda tetap bisa menulis ringkasan sendiri.`,
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      const [generation] = await tx
        .insert(aiGenerations)
        .values({
          tenantId: ctx.tenantId,
          reviewId: review.id,
          input: buildSummaryInput(
            { cycle: review.cycle, startDate: review.startDate, endDate: review.endDate, positionName: review.employee.positionName, departmentName: review.employee.departmentName },
            scored.template.name,
            scored.result,
            pendingTaskLogs,
          ),
          requestedByUserId: user.userId,
          requestedByName: await this.reviews.actorName(tx, user),
          // Jam aplikasi (sama dengan pembanding macet & bulan kuota)
          createdAt: new Date(),
        })
        .returning({ id: aiGenerations.id });
      if (!generation) throw new Error("[kpi-review-summaries/generate] insert generasi tidak mengembalikan baris");
      await tx
        .insert(kpiReviewSummaries)
        .values({ tenantId: ctx.tenantId, reviewId: review.id, generationId: generation.id })
        .onConflictDoUpdate({ target: [kpiReviewSummaries.tenantId, kpiReviewSummaries.reviewId], set: { generationId: generation.id } });
      await this.audit.record(tx, ctx, {
        entity: "kpi_review_summary",
        entityId: review.id,
        action: "generate",
        before: { generationId: summary?.generation?.id ?? null },
        after: { generationId: generation.id },
      });
      return generation.id;
    });

    // Enqueue setelah commit agar worker pasti melihat barisnya; jobId = id generasi (idempoten)
    try {
      await this.queue.add(KPI_REVIEW_SUMMARY_JOB, { tenantId: ctx.tenantId, generationId }, { jobId: generationId });
    } catch (error) {
      this.logger.error(`[kpi-review-summaries/generate] gagal enqueue ${generationId}: ${error instanceof Error ? error.message : String(error)}`);
      await withTenant(this.db, { tenantId: ctx.tenantId, userId: null }, (tx) => this.fail(tx, generationId, QUEUE_DOWN));
      throw new ServiceUnavailableException(QUEUE_DOWN);
    }
  }

  // Simpan narasi (edit hasil AI / tulis sendiri) — sekaligus dianggap sudah ditinjau
  async edit(user: AuthUser, id: string, input: KpiReviewSummaryEditInput): Promise<void> {
    const ctx = tenantContextOf(user);
    await withTenant(this.db, ctx, async (tx) => {
      const { review, summary } = await this.lockWritable(tx, ctx, id, input.version);
      const source: KpiSummarySource =
        !summary?.body || summary.source === "manual" ? "manual" : summary.body === input.body ? (summary.source ?? "ai") : "edited";
      const reviewer = { reviewedAt: new Date(), reviewedByUserId: user.userId, reviewedByName: await this.reviews.actorName(tx, user) };
      await tx
        .insert(kpiReviewSummaries)
        .values({ tenantId: ctx.tenantId, reviewId: review.id, body: input.body, source, ...reviewer })
        .onConflictDoUpdate({ target: [kpiReviewSummaries.tenantId, kpiReviewSummaries.reviewId], set: { body: input.body, source, ...reviewer } });
      await this.audit.record(tx, ctx, {
        entity: "kpi_review_summary",
        entityId: review.id,
        action: "edit",
        before: { body: summary?.body ?? null, source: summary?.source ?? null, reviewed: Boolean(summary?.reviewedAt) },
        after: { body: input.body, source, reviewed: true },
      });
    });
  }

  // Tandai narasi AI sudah ditinjau tanpa mengubah isinya
  async markReviewed(user: AuthUser, id: string, input: KpiReviewSummaryReviewInput): Promise<void> {
    const ctx = tenantContextOf(user);
    await withTenant(this.db, ctx, async (tx) => {
      const { review, summary } = await this.lockWritable(tx, ctx, id, input.version);
      if (!summary?.body) throw new BadRequestException("Belum ada ringkasan untuk ditinjau.");
      if (summary.reviewedAt) return;
      await tx
        .update(kpiReviewSummaries)
        .set({ reviewedAt: new Date(), reviewedByUserId: user.userId, reviewedByName: await this.reviews.actorName(tx, user) })
        .where(eq(kpiReviewSummaries.reviewId, review.id));
      await this.audit.record(tx, ctx, { entity: "kpi_review_summary", entityId: review.id, action: "review", before: { reviewed: false }, after: { reviewed: true } });
    });
  }

  // ——— helper ———

  private async lockWritable(tx: Transaction, ctx: TenantContext, id: string, version: string): Promise<Locked> {
    const viewer = await this.reviews.requireViewer(tx, ctx);
    const { review, scored } = await this.reviews.lockForSummary(tx, ctx, viewer, id);
    this.requireWriter(viewer, review, scored.template !== null);
    const summary = await this.lockSummary(tx, review.id, version);
    return { review, viewer, summary };
  }

  // Kunci narasi, periksa versi, dan tolak selama generasi AI masih berjalan. Generasi macet ditandai gagal.
  private async lockSummary(tx: Transaction, reviewId: string, version: string): Promise<SummaryRecord | null> {
    const summary = await loadSummary(tx, reviewId, true);
    if ((summary?.version ?? NO_SUMMARY_VERSION) !== version) throw new ConflictException(CHANGED);
    const generation = summary?.generation ?? null;
    if (generationPending(generation, new Date())) throw new ConflictException(PENDING);
    if (generation && (generation.status === "queued" || generation.status === "running")) {
      await this.fail(tx, generation.id, STALE_ERROR);
      generation.status = "failed";
    }
    return summary;
  }

  private requireWriter(viewer: AttendanceViewer, review: ReviewRecord, hasTemplate: boolean): void {
    if (review.employee.id === viewer.ownEmployeeId) throw new ForbiddenException("Anda tidak dapat menulis ringkasan penilaian Anda sendiri");
    if (!canWriteSummary(viewer, { status: review.status, employeeId: review.employee.id }, hasTemplate)) {
      throw new ForbiddenException(
        review.status === "reviewed" ? "Penilaian sudah dikirim — hanya pemilik atau admin yang dapat mengubah ringkasan." : "Anda tidak dapat mengubah ringkasan ini",
      );
    }
  }

  private async fail(tx: Transaction, generationId: string, error: string): Promise<void> {
    await tx
      .update(aiGenerations)
      .set({ status: "failed", error, output: null, completedAt: new Date() })
      .where(eq(aiGenerations.id, generationId));
  }
}

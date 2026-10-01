import { z } from "zod";

import { KPI_PREDICATES, kpiIndicatorScoreSchema, kpiScoreDaysSchema } from "./kpiScores.js";

// Ringkasan AI penilaian KPI periodik (feature 23): panel narasi di /kpi/reviews/[id].
//
// - AI hanya menulis NARASI dari data terstruktur (skor, rincian indikator, kehadiran) — tidak menentukan skor/predikat.
//   Tanpa nama/identitas karyawan: yang dikirim hanya jabatan, departemen, periode, dan angka.
// - Generate = satu baris ai_generations (input terstruktur + output + versi prompt + model) diproses worker lewat antrean
//   BullMQ. Kuota per usaha per bulan (zona waktu usaha); generasi gagal tidak dihitung.
// - Narasi opsional. Jika ada, wajib DITINJAU manusia (tandai sudah ditinjau / diedit / ditulis sendiri) sebelum final;
//   saat final narasi ikut snapshot dan terkunci.

export const DEFAULT_AI_SUMMARY_MONTHLY_QUOTA = 200;
export const KPI_SUMMARY_MAX_LENGTH = 4000;
// Generasi queued/running lebih lama dari ini dianggap macet (worker mati) → boleh generate ulang
export const AI_GENERATION_STALE_MINUTES = 10;

// Antrean BullMQ bersama api (produsen) & worker (konsumen)
export const AI_QUEUE_NAME = "ai";
export const KPI_REVIEW_SUMMARY_JOB = "kpi-review-summary";
export const aiJobDataSchema = z.object({ tenantId: z.uuid(), generationId: z.uuid() });
export type AiJobData = z.infer<typeof aiJobDataSchema>;

export const AI_GENERATION_STATUSES = ["queued", "running", "succeeded", "failed"] as const;
export type AiGenerationStatus = (typeof AI_GENERATION_STATUSES)[number];

// ai = hasil AI apa adanya; edited = hasil AI yang diubah manusia; manual = ditulis manusia tanpa AI
export const KPI_SUMMARY_SOURCES = ["ai", "edited", "manual"] as const;
export type KpiSummarySource = (typeof KPI_SUMMARY_SOURCES)[number];

// ——— Input terstruktur untuk AI (disimpan di ai_generations.input) ———

export const kpiSummaryInputSchema = z.object({
  period: z.object({ cycle: z.enum(["weekly", "monthly", "quarterly"]), startDate: z.string(), endDate: z.string() }),
  employee: z.object({ positionName: z.string(), departmentName: z.string() }),
  templateName: z.string(),
  score: z.string().nullable(),
  predicate: z.enum(KPI_PREDICATES).nullable(),
  days: kpiScoreDaysSchema,
  indicators: z.array(kpiIndicatorScoreSchema.omit({ id: true })),
  // Catatan tugas yang belum diverifikasi (tidak ikut skor)
  pendingTaskLogs: z.number().int(),
});
export type KpiSummaryInput = z.infer<typeof kpiSummaryInputSchema>;

// ——— Tampilan di detail penilaian ———

export const kpiReviewSummarySchema = z.object({
  // null = belum ada narasi
  body: z.string().nullable(),
  source: z.enum(KPI_SUMMARY_SOURCES).nullable(),
  // Versi narasi (mikrodetik updated_at; "0" = belum ada) — dikirim balik saat mengubah
  version: z.string(),
  reviewedAt: z.string().nullable(),
  reviewedByName: z.string().nullable(),
  // Generasi AI terakhir; null = belum pernah
  generation: z
    .object({
      status: z.enum(AI_GENERATION_STATUSES),
      // true = masih diproses (queued/running dan belum macet)
      pending: z.boolean(),
      // Pesan aman untuk pengguna jika gagal
      error: z.string().nullable(),
      requestedAt: z.string(),
      requestedByName: z.string().nullable(),
      model: z.string().nullable(),
    })
    .nullable(),
  // null untuk penilaian final
  quota: z.object({ used: z.number().int(), limit: z.number().int(), resetsOn: z.string() }).nullable(),
});
export type KpiReviewSummary = z.infer<typeof kpiReviewSummarySchema>;

// Narasi yang dikunci bersama snapshot final
export const kpiReviewSummarySnapshotSchema = z.object({
  body: z.string(),
  source: z.enum(KPI_SUMMARY_SOURCES),
  reviewedAt: z.string(),
  reviewedByName: z.string().nullable(),
  model: z.string().nullable(),
  promptVersion: z.string().nullable(),
});
export type KpiReviewSummarySnapshot = z.infer<typeof kpiReviewSummarySnapshotSchema>;

// ——— Mutasi ———

const summaryVersionSchema = z.string().regex(/^[0-9]{1,20}$/, "Versi tidak valid");

export const kpiReviewSummaryGenerateSchema = z.object({ version: summaryVersionSchema });
export type KpiReviewSummaryGenerateInput = z.infer<typeof kpiReviewSummaryGenerateSchema>;

// Simpan narasi (edit hasil AI atau tulis sendiri) = sekaligus ditinjau
export const kpiReviewSummaryEditSchema = z.object({
  version: summaryVersionSchema,
  body: z
    .string()
    .trim()
    .min(1, "Tulis ringkasan kinerja")
    .max(KPI_SUMMARY_MAX_LENGTH, `Ringkasan maksimal ${KPI_SUMMARY_MAX_LENGTH} karakter`),
});
export type KpiReviewSummaryEditInput = z.infer<typeof kpiReviewSummaryEditSchema>;

export const kpiReviewSummaryReviewSchema = z.object({ version: summaryVersionSchema });
export type KpiReviewSummaryReviewInput = z.infer<typeof kpiReviewSummaryReviewSchema>;

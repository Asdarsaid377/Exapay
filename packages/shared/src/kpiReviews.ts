import { z } from "zod";

import { KPI_PREDICATES, kpiScoreResultSchema } from "./kpiScores.js";
import { KPI_RATING_SCALE_MAX } from "./kpiTemplates.js";
import { isoDateSchema } from "./workCalendar.js";

// Siklus & penilaian periodik (feature 22): /settings/kpi (siklus), /kpi/reviews (daftar per periode), /kpi/reviews/[id] (detail).
//
// - Siklus per usaha (tenants.kpi_review_cycle, default bulanan). Mengubah siklus hanya memengaruhi periode yang dibuat berikutnya.
// - Periode dibuat manual oleh owner/admin dari periode siklus saat ini yang sudah berakhir; periode satu usaha tidak boleh
//   beririsan (exclusion constraint). Membuat periode = satu penilaian per karyawan yang masa kerjanya beririsan dengan periode
//   dan jabatannya memakai template KPI. Membuat ulang periode yang sama menambahkan karyawan yang belum ada.
// - Status: draft (atasan langsung / owner/admin mengisi nilai indikator penilaian) → reviewed (dikirim) → final (owner/admin).
//   Owner/admin bisa mengembalikan reviewed → draft. Tidak ada yang menilai / memfinalkan penilaiannya sendiri.
// - Skor draft/reviewed dihitung saat dibaca (rumus skor ad-hoc + nilai atasan). Final = snapshot terkunci (skor, rincian,
//   nama karyawan/jabatan/template) — perubahan catatan tugas, absensi, atau template sesudahnya tidak mengubahnya.

export const KPI_REVIEW_CYCLES = ["weekly", "monthly", "quarterly"] as const;
export type KpiReviewCycle = (typeof KPI_REVIEW_CYCLES)[number];

export const DEFAULT_KPI_REVIEW_CYCLE: KpiReviewCycle = "monthly";

export const KPI_REVIEW_CYCLE_LABELS: Record<KpiReviewCycle, string> = {
  weekly: "Mingguan",
  monthly: "Bulanan",
  quarterly: "Triwulanan",
};

export const KPI_REVIEW_STATUSES = ["draft", "reviewed", "final"] as const;
export type KpiReviewStatus = (typeof KPI_REVIEW_STATUSES)[number];

export const KPI_REVIEW_STATUS_LABELS: Record<KpiReviewStatus, string> = {
  draft: "Draf",
  reviewed: "Direview",
  final: "Final",
};

// ——— Pengaturan siklus ———

export const kpiSettingsInputSchema = z.object({
  reviewCycle: z.enum(KPI_REVIEW_CYCLES, "Pilih siklus penilaian"),
});
export type KpiSettingsInput = z.infer<typeof kpiSettingsInputSchema>;

export const kpiSettingsSchema = z.object({
  reviewCycle: z.enum(KPI_REVIEW_CYCLES),
  // Periode siklus saat ini yang sedang berjalan (zona waktu usaha) — contoh di halaman pengaturan
  currentPeriod: z.object({ startDate: z.string(), endDate: z.string() }),
});
export type KpiSettings = z.infer<typeof kpiSettingsSchema>;

// ——— Periode & daftar penilaian ———

export const kpiReviewListQuerySchema = z.object({
  period: z.uuid().optional().catch(undefined),
});
export type KpiReviewListQuery = z.infer<typeof kpiReviewListQuerySchema>;

// Buat penilaian untuk periode siklus saat ini yang dimulai di tanggal ini
export const createKpiReviewsSchema = z.object({ startDate: isoDateSchema });
export type CreateKpiReviewsInput = z.infer<typeof createKpiReviewsSchema>;

export const createKpiReviewsResultSchema = z.object({ periodId: z.string(), created: z.number().int() });
export type CreateKpiReviewsResult = z.infer<typeof createKpiReviewsResultSchema>;

const periodRangeSchema = z.object({ startDate: z.string(), endDate: z.string() });
export type KpiReviewPeriodRange = z.infer<typeof periodRangeSchema>;

const statusCountsSchema = z.object({ draft: z.number().int(), reviewed: z.number().int(), final: z.number().int() });

export const kpiReviewPeriodSchema = periodRangeSchema.extend({
  id: z.string(),
  cycle: z.enum(KPI_REVIEW_CYCLES),
  // Jumlah penilaian yang terlihat penglihat per status
  counts: statusCountsSchema,
});
export type KpiReviewPeriod = z.infer<typeof kpiReviewPeriodSchema>;

export const kpiReviewRowSchema = z.object({
  id: z.string(),
  status: z.enum(KPI_REVIEW_STATUSES),
  employee: z.object({ id: z.string(), fullName: z.string(), positionName: z.string(), departmentName: z.string() }),
  // null = jabatan karyawan kini tanpa template KPI (draft/reviewed)
  templateName: z.string().nullable(),
  // Final = skor snapshot; selainnya dihitung saat dibaca. null = belum ada indikator yang bisa dihitung
  score: z.string().nullable(),
  predicate: z.enum(KPI_PREDICATES).nullable(),
  // Indikator penilaian atasan yang belum dinilai (draft)
  unratedCount: z.number().int(),
});
export type KpiReviewRow = z.infer<typeof kpiReviewRowSchema>;

export const kpiReviewListSchema = z.object({
  scope: z.enum(["all", "subordinates"]),
  cycle: z.enum(KPI_REVIEW_CYCLES),
  today: z.string(),
  // Semua periode usaha, terbaru dulu
  periods: z.array(kpiReviewPeriodSchema),
  // Periode terpilih (query period, atau terbaru); null = belum ada periode
  period: kpiReviewPeriodSchema.nullable(),
  rows: z.array(kpiReviewRowSchema),
  // Owner/admin: periode siklus saat ini yang sudah berakhir & belum dibuat (terbaru dulu); atasan: []
  candidates: z.array(periodRangeSchema),
  // Owner/admin: karyawan yang memenuhi syarat di periode terpilih tetapi belum punya penilaian
  missingCount: z.number().int(),
});
export type KpiReviewList = z.infer<typeof kpiReviewListSchema>;

// ——— Detail ———

export const kpiReviewSnapshotSchema = z.object({
  employee: z.object({ fullName: z.string(), positionName: z.string(), departmentName: z.string() }),
  template: z.object({ id: z.string(), name: z.string() }),
  result: kpiScoreResultSchema,
});
export type KpiReviewSnapshot = z.infer<typeof kpiReviewSnapshotSchema>;

export const kpiReviewDetailSchema = z.object({
  id: z.string(),
  status: z.enum(KPI_REVIEW_STATUSES),
  // Versi isi (mikrodetik updated_at) — dikirim balik saat mengubah agar tidak menimpa perubahan orang lain
  version: z.string(),
  period: periodRangeSchema.extend({ id: z.string(), cycle: z.enum(KPI_REVIEW_CYCLES) }),
  employee: z.object({ id: z.string(), fullName: z.string(), positionName: z.string(), departmentName: z.string() }),
  template: z.object({ id: z.string(), name: z.string() }).nullable(),
  // null = tanpa template (draft/reviewed)
  result: kpiScoreResultSchema.nullable(),
  // Catatan tugas di periode yang masih menunggu verifikasi (belum masuk skor); final → 0
  pendingTaskLogs: z.number().int(),
  submittedAt: z.string().nullable(),
  submittedByName: z.string().nullable(),
  finalizedAt: z.string().nullable(),
  finalizedByName: z.string().nullable(),
  permissions: z.object({ rate: z.boolean(), returnToDraft: z.boolean(), finalize: z.boolean() }),
});
export type KpiReviewDetail = z.infer<typeof kpiReviewDetailSchema>;

// ——— Mutasi ———

const versionSchema = z.string().regex(/^[0-9]{1,20}$/, "Versi tidak valid");

// Nilai indikator penilaian atasan (mengganti semua nilai penilaian ini). submit = sekalian kirim untuk direview
// (semua indikator penilaian wajib dinilai).
export const kpiReviewRatingsSchema = z
  .object({
    version: versionSchema,
    ratings: z
      .array(
        z.object({
          indicatorId: z.uuid("Indikator tidak valid"),
          rating: z
            .number("Pilih nilai")
            .int("Nilai berupa bilangan bulat")
            .min(1, "Nilai minimal 1")
            .max(KPI_RATING_SCALE_MAX, `Nilai maksimal ${KPI_RATING_SCALE_MAX}`),
        }),
      )
      .max(10),
    submit: z.boolean(),
  })
  .superRefine((input, ctx) => {
    const ids = input.ratings.map((rating) => rating.indicatorId);
    if (new Set(ids).size !== ids.length) ctx.addIssue({ code: "custom", path: ["ratings"], message: "Indikator dinilai lebih dari sekali" });
  });
export type KpiReviewRatingsInput = z.infer<typeof kpiReviewRatingsSchema>;

export const KPI_REVIEW_STATUS_ACTIONS = ["return", "finalize"] as const;
export type KpiReviewStatusAction = (typeof KPI_REVIEW_STATUS_ACTIONS)[number];

export const kpiReviewStatusSchema = z.object({
  action: z.enum(KPI_REVIEW_STATUS_ACTIONS),
  version: versionSchema,
});
export type KpiReviewStatusInput = z.infer<typeof kpiReviewStatusSchema>;

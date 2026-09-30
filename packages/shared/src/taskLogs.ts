import { z } from "zod";

import { ATTENDANCE_ACCESS } from "./attendance.js";
import { KPI_TARGET_PERIODS } from "./kpiTemplates.js";
import { isoDateSchema } from "./workCalendar.js";

// Log tugas harian karyawan (feature 19, portal /me/tasks + kartu "Tugas hari ini" di /me).
// Satu entri = satu catatan pekerjaan di satu tanggal kerja: realisasi indikator template jabatan (angka/jumlah)
// ATAU "pekerjaan lain" (deskripsi tanpa indikator — tidak masuk hitungan skor). Boleh banyak entri per indikator per hari;
// realisasi harian = jumlah entri. Wajib sudah absen masuk di tanggal itu. Diverifikasi atasan di feature 20.

// Hanya indikator ini yang dicatat karyawan; rating dinilai atasan, system dihitung dari absensi
export const LOGGABLE_KPI_INDICATOR_TYPES = ["numeric", "count"] as const;
export type LoggableKpiIndicatorType = (typeof LOGGABLE_KPI_INDICATOR_TYPES)[number];

export const TASK_LOG_STATUSES = ["pending", "approved", "rejected"] as const;
export type TaskLogStatus = (typeof TASK_LOG_STATUSES)[number];

export const TASK_LOG_STATUS_LABELS: Record<TaskLogStatus, string> = {
  pending: "Menunggu verifikasi",
  approved: "Disetujui",
  rejected: "Ditolak",
};

// Hari ini + 7 hari ke belakang (zona waktu usaha)
export const TASK_LOG_BACKDATE_DAYS = 7;
export const TASK_LOGS_PER_DAY_MAX = 50;
export const TASK_LOG_NOTE_MAX = 500;
// Pekerjaan lain wajib dideskripsikan
export const TASK_LOG_OTHER_NOTE_MIN = 3;

// Foto bukti opsional: JPG/PNG/WebP maks. 5 MB (web memperkecil foto kamera sebelum dikirim). Jenis diperiksa dari isi file di API.
export const TASK_PHOTO_MAX_BYTES = 5 * 1024 * 1024;
export const TASK_PHOTO_ACCEPT = "image/jpeg,image/png,image/webp";
export const TASK_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type TaskPhotoType = (typeof TASK_PHOTO_TYPES)[number];

// Realisasi dikirim sebagai string desimal (numeric(18,2) di DB) — tidak pernah number.
// Indikator jumlah (count) harus bilangan bulat — dicek API terhadap tipe indikator.
const QUANTITY = /^[0-9]{1,13}(\.[0-9]{1,2})?$/;
export const taskQuantitySchema = z
  .string()
  .regex(QUANTITY, "Realisasi berupa angka, maksimal 2 angka di belakang koma")
  .refine((value) => /[1-9]/.test(value), "Realisasi harus lebih dari 0");

// Field multipart selalu string; kosong = tidak diisi
const blankToNull = (value: unknown): unknown => (value === undefined || value === null || (typeof value === "string" && value.trim() === "") ? null : value);

const taskLogFields = {
  indicatorId: z.preprocess(blankToNull, z.uuid("Indikator tidak valid").nullable()),
  quantity: z.preprocess(blankToNull, taskQuantitySchema.nullable()),
  note: z.preprocess(blankToNull, z.string().trim().max(TASK_LOG_NOTE_MAX, `Catatan maksimal ${TASK_LOG_NOTE_MAX} karakter`).nullable()),
};

type TaskLogFields = { indicatorId: string | null; quantity: string | null; note: string | null };

function refineTaskLog(input: TaskLogFields, ctx: z.RefinementCtx): void {
  if (input.indicatorId) {
    if (input.quantity === null) ctx.addIssue({ code: "custom", path: ["quantity"], message: "Isi realisasi" });
    return;
  }
  if (input.quantity !== null) ctx.addIssue({ code: "custom", path: ["quantity"], message: "Pekerjaan lain tidak memakai realisasi angka" });
  if (!input.note || input.note.length < TASK_LOG_OTHER_NOTE_MIN) {
    ctx.addIssue({ code: "custom", path: ["note"], message: `Tuliskan pekerjaan yang dilakukan (minimal ${TASK_LOG_OTHER_NOTE_MIN} karakter)` });
  }
}

// Catat tugas (multipart: workDate, indicatorId, quantity, note + photo opsional)
export const taskLogInputSchema = z.object({ workDate: isoDateSchema, ...taskLogFields }).superRefine(refineTaskLog);
export type TaskLogInput = z.output<typeof taskLogInputSchema>;

// Ubah catatan (tanggal tetap). removePhoto "true" = hapus foto lama tanpa pengganti.
export const taskLogUpdateSchema = z
  .object({ ...taskLogFields, removePhoto: z.preprocess((value) => value === "true" || value === true, z.boolean()) })
  .superRefine(refineTaskLog);
export type TaskLogUpdateInput = z.output<typeof taskLogUpdateSchema>;

export const myTaskDayQuerySchema = z.object({
  // Tanpa tanggal → hari ini di zona waktu usaha
  date: isoDateSchema.optional(),
});
export type MyTaskDayQuery = z.infer<typeof myTaskDayQuerySchema>;

// ——— Respons API ———

const indicatorRefSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(LOGGABLE_KPI_INDICATOR_TYPES),
  unit: z.string(),
});
export type TaskLogIndicator = z.infer<typeof indicatorRefSchema>;

export const taskLogSchema = z.object({
  id: z.string(),
  workDate: z.string(),
  // null = pekerjaan lain
  indicator: indicatorRefSchema.nullable(),
  // String desimal tanpa nol di belakang ("86", "2.5"); null = pekerjaan lain
  quantity: z.string().nullable(),
  note: z.string().nullable(),
  photo: z.object({ contentType: z.enum(TASK_PHOTO_TYPES), size: z.number().int() }).nullable(),
  status: z.enum(TASK_LOG_STATUSES),
  createdAt: z.string(),
  updatedAt: z.string(),
  // Terakhir diubah karyawan; null = belum pernah diubah
  editedAt: z.string().nullable(),
  // Keputusan atasan (feature 20). verifiedQuantity = realisasi yang diakui (≠ quantity → dikoreksi atasan)
  verifiedQuantity: z.string().nullable(),
  decidedAt: z.string().nullable(),
  decidedByName: z.string().nullable(),
  decisionNote: z.string().nullable(),
  // Masih bisa diubah/dihapus pemiliknya (menunggu verifikasi & tanggal di dalam jendela catat)
  editable: z.boolean(),
});
export type TaskLog = z.infer<typeof taskLogSchema>;

// Ringkasan satu indikator template di tanggal terpilih (kartu "Tugas hari ini")
export const taskIndicatorDaySchema = z.object({
  ...indicatorRefSchema.shape,
  target: z.string(),
  targetPeriod: z.enum(KPI_TARGET_PERIODS),
  // Jumlah realisasi entri yang tidak ditolak (yang sudah dikoreksi atasan memakai angka koreksi)
  total: z.string(),
  entryCount: z.number().int(),
  pendingCount: z.number().int(),
  approvedCount: z.number().int(),
  rejectedCount: z.number().int(),
  lastLoggedAt: z.string().nullable(),
});
export type TaskIndicatorDay = z.infer<typeof taskIndicatorDaySchema>;

export const myTaskDaySchema = z.object({
  access: z.enum(ATTENDANCE_ACCESS),
  timeZone: z.string(),
  // Tanggal hari ini (zona waktu usaha) & tanggal paling awal yang masih boleh dicatat
  today: z.string(),
  minDate: z.string(),
  date: z.string(),
  // Sudah absen masuk di tanggal terpilih
  checkedIn: z.boolean(),
  // Boleh mencatat di tanggal terpilih (akses ok, di dalam jendela, sudah absen masuk)
  canLog: z.boolean(),
  // Template KPI jabatan saat ini; null = jabatan belum punya template (hanya pekerjaan lain)
  template: z.object({ id: z.string(), name: z.string() }).nullable(),
  indicators: z.array(taskIndicatorDaySchema),
  otherCount: z.number().int(),
  // Entri tanggal terpilih, terbaru di atas
  logs: z.array(taskLogSchema),
  // Tanggal di jendela catat (terbaru dulu): sudah absen masuk + jumlah entri
  days: z.array(z.object({ date: z.string(), checkedIn: z.boolean(), count: z.number().int() })),
});
export type MyTaskDay = z.infer<typeof myTaskDaySchema>;

// ——— Verifikasi atasan (feature 20, /kpi/verification) ———
// Atasan langsung atau owner/admin memutuskan tiap catatan: setujui, tolak (beralasan), atau koreksi angka (beralasan,
// = disetujui dengan realisasi yang diakui berbeda). Keputusan final. Hanya catatan indikator yang disetujui masuk skor KPI.

export const TASK_DECISIONS = ["approve", "reject", "correct"] as const;
export type TaskDecision = (typeof TASK_DECISIONS)[number];

export const TASK_DECISION_NOTE_MIN = 3;
export const TASK_BULK_APPROVE_MAX = 100;
export const TASK_VERIFICATION_PAGE_SIZE = 50;

// Versi isi catatan saat dibaca atasan (mikrodetik epoch updated_at). Keputusan ditolak bila karyawan mengubahnya sesudah itu.
const versionSchema = z.string().regex(/^[0-9]{1,20}$/, "Versi catatan tidak valid");

export const taskDecisionSchema = z
  .object({
    decision: z.enum(TASK_DECISIONS),
    version: versionSchema,
    // Hanya untuk koreksi: realisasi yang diakui
    quantity: z.preprocess(blankToNull, taskQuantitySchema.nullable()).default(null),
    note: z.string().trim().max(TASK_LOG_NOTE_MAX, `Catatan maksimal ${TASK_LOG_NOTE_MAX} karakter`).default(""),
  })
  .superRefine((input, ctx) => {
    if (input.decision === "correct" && input.quantity === null) ctx.addIssue({ code: "custom", path: ["quantity"], message: "Isi realisasi yang benar" });
    if (input.decision !== "correct" && input.quantity !== null) ctx.addIssue({ code: "custom", path: ["quantity"], message: "Realisasi hanya diisi saat mengoreksi" });
    if (input.decision !== "approve" && input.note.length < TASK_DECISION_NOTE_MIN) {
      ctx.addIssue({
        code: "custom",
        path: ["note"],
        message: `${input.decision === "reject" ? "Tulis alasan penolakan" : "Tulis alasan koreksi"} (minimal ${TASK_DECISION_NOTE_MIN} karakter)`,
      });
    }
  });
export type TaskDecisionInput = z.input<typeof taskDecisionSchema>;
export type TaskDecisionData = z.output<typeof taskDecisionSchema>;

// Setujui sekaligus: catatan yang sudah diputuskan / diubah karyawan sejak dibaca dilewati
export const taskBulkApproveSchema = z.object({
  items: z
    .array(z.object({ id: z.uuid("Catatan tidak valid"), version: versionSchema }))
    .min(1, "Pilih minimal satu catatan")
    .max(TASK_BULK_APPROVE_MAX, `Maksimal ${TASK_BULK_APPROVE_MAX} catatan sekaligus`)
    .refine((items) => new Set(items.map((item) => item.id)).size === items.length, "Catatan terpilih ganda"),
});
export type TaskBulkApproveInput = z.infer<typeof taskBulkApproveSchema>;

export const taskBulkApproveResultSchema = z.object({ approved: z.number().int(), skipped: z.number().int() });
export type TaskBulkApproveResult = z.infer<typeof taskBulkApproveResultSchema>;

export const TASK_VERIFICATION_FILTERS = ["pending", "approved", "rejected", "all"] as const;
export type TaskVerificationFilter = (typeof TASK_VERIFICATION_FILTERS)[number];

export const taskVerificationQuerySchema = z.object({
  status: z.enum(TASK_VERIFICATION_FILTERS).catch("pending"),
  page: z.coerce.number().int().min(1).catch(1),
});
export type TaskVerificationQuery = z.infer<typeof taskVerificationQuerySchema>;

export const taskVerificationItemSchema = taskLogSchema.omit({ indicator: true, editable: true }).extend({
  // Indikator + target template saat ini (konteks koreksi)
  indicator: indicatorRefSchema.extend({ target: z.string(), targetPeriod: z.enum(KPI_TARGET_PERIODS) }).nullable(),
  employee: z.object({ id: z.string(), fullName: z.string(), positionName: z.string() }),
  version: z.string(),
  // Menunggu & bukan catatan milik sendiri
  canDecide: z.boolean(),
});
export type TaskVerificationItem = z.infer<typeof taskVerificationItemSchema>;

export const taskVerificationListSchema = z.object({
  // Urut: menunggu → tanggal kerja terlama dulu; selainnya → keputusan terbaru dulu. Dikelompokkan per karyawan + tanggal di UI.
  items: z.array(taskVerificationItemSchema),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
  pendingCount: z.number().int(),
  // all = owner/admin (semua karyawan), subordinates = atasan (bawahan langsung)
  scope: z.enum(["all", "subordinates"]),
  timeZone: z.string(),
});
export type TaskVerificationList = z.infer<typeof taskVerificationListSchema>;

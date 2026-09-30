import { z } from "zod";

import { ATTENDANCE_ACCESS, attendanceMonthSchema } from "./attendance.js";
import { CALENDAR_YEAR_MAX, CALENDAR_YEAR_MIN, isoDateSchema } from "./workCalendar.js";

// Pengajuan izin/sakit/cuti (feature 15): diajukan karyawan dari portal /me/attendance, disetujui atasan langsung
// atau owner/admin di /attendance/requests. Rentang hari penuh, tanpa saldo cuti (fase berikutnya).

export const LEAVE_TYPES = ["permit", "sick", "leave"] as const;
export type LeaveType = (typeof LEAVE_TYPES)[number];

export const LEAVE_TYPE_LABELS: Record<LeaveType, string> = {
  permit: "Izin",
  sick: "Sakit",
  leave: "Cuti",
};

// cancelled = dibatalkan karyawan selama masih menunggu
export const LEAVE_REQUEST_STATUSES = ["pending", "approved", "rejected", "cancelled"] as const;
export type LeaveRequestStatus = (typeof LEAVE_REQUEST_STATUSES)[number];

export const LEAVE_REQUEST_STATUS_LABELS: Record<LeaveRequestStatus, string> = {
  pending: "Menunggu",
  approved: "Disetujui",
  rejected: "Ditolak",
  cancelled: "Dibatalkan",
};

// Rentang maksimal satu pengajuan (hari kalender) — cukup untuk cuti melahirkan 3 bulan
export const LEAVE_REQUEST_MAX_DAYS = 92;
export const LEAVE_REASON_MAX = 500;
export const LEAVE_REQUESTS_PAGE_SIZE = 20;

// Lampiran (surat dokter, dsb.): PDF/JPG/PNG maks. 5 MB. Jenis file diperiksa dari isi file di API, bukan dari nama.
export const LEAVE_ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024;
export const LEAVE_ATTACHMENT_ACCEPT = ".pdf,.jpg,.jpeg,.png";
export const LEAVE_ATTACHMENT_TYPES = ["application/pdf", "image/jpeg", "image/png"] as const;
export type LeaveAttachmentType = (typeof LEAVE_ATTACHMENT_TYPES)[number];

const DAY_MS = 24 * 60 * 60 * 1000;

// Jumlah hari kalender inklusif antara dua tanggal YYYY-MM-DD
export function calendarDaysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS) + 1;
}

const leaveDateSchema = isoDateSchema.refine((value) => {
  const year = Number(value.slice(0, 4));
  return year >= CALENDAR_YEAR_MIN && year <= CALENDAR_YEAR_MAX;
}, "Tahun di luar rentang yang didukung");

// Field multipart dikirim sebagai string — skema ini dipakai form web dan API
export const leaveRequestInputSchema = z
  .object({
    type: z.enum(LEAVE_TYPES, "Pilih jenis pengajuan"),
    startDate: leaveDateSchema,
    endDate: leaveDateSchema,
    reason: z.string("Alasan wajib diisi").trim().min(3, "Alasan minimal 3 karakter").max(LEAVE_REASON_MAX, `Alasan maksimal ${LEAVE_REASON_MAX} karakter`),
  })
  .refine((input) => input.endDate >= input.startDate, { path: ["endDate"], message: "Tanggal selesai tidak boleh sebelum tanggal mulai" })
  .refine((input) => input.endDate < input.startDate || calendarDaysBetween(input.startDate, input.endDate) <= LEAVE_REQUEST_MAX_DAYS, {
    path: ["endDate"],
    message: `Satu pengajuan maksimal ${LEAVE_REQUEST_MAX_DAYS} hari`,
  });
export type LeaveRequestInput = z.infer<typeof leaveRequestInputSchema>;

export const LEAVE_DECISIONS = ["approve", "reject"] as const;
export type LeaveDecision = (typeof LEAVE_DECISIONS)[number];

// Menolak wajib disertai alasan (dibaca karyawan); menyetujui boleh tanpa catatan
export const leaveDecisionSchema = z
  .object({
    decision: z.enum(LEAVE_DECISIONS),
    note: z.string().trim().max(LEAVE_REASON_MAX, `Catatan maksimal ${LEAVE_REASON_MAX} karakter`).default(""),
  })
  .refine((input) => input.decision === "approve" || input.note.length >= 3, { path: ["note"], message: "Tulis alasan penolakan (minimal 3 karakter)" });
export type LeaveDecisionInput = z.input<typeof leaveDecisionSchema>;
export type LeaveDecisionData = z.output<typeof leaveDecisionSchema>;

// Filter daftar persetujuan
export const LEAVE_REQUEST_FILTERS = ["pending", "approved", "rejected", "all"] as const;
export type LeaveRequestFilter = (typeof LEAVE_REQUEST_FILTERS)[number];

export const leaveRequestListQuerySchema = z.object({
  status: z.enum(LEAVE_REQUEST_FILTERS).catch("pending"),
  page: z.coerce.number().int().min(1).catch(1),
});
export type LeaveRequestListQuery = z.infer<typeof leaveRequestListQuerySchema>;

export const myLeaveRequestsQuerySchema = z.object({
  // Tanpa bulan → bulan berjalan di zona waktu usaha
  month: attendanceMonthSchema.optional(),
});
export type MyLeaveRequestsQuery = z.infer<typeof myLeaveRequestsQuerySchema>;

// ——— Respons API ———

const attachmentSchema = z.object({
  name: z.string(),
  contentType: z.enum(LEAVE_ATTACHMENT_TYPES),
  size: z.number().int(),
});
export type LeaveAttachment = z.infer<typeof attachmentSchema>;

const leaveRequestShape = {
  id: z.string(),
  type: z.enum(LEAVE_TYPES),
  startDate: z.string(),
  endDate: z.string(),
  // Hari kerja di dalam rentang (jadwal kerja − libur yang diikuti), dihitung saat dibaca
  workingDays: z.number().int(),
  reason: z.string(),
  status: z.enum(LEAVE_REQUEST_STATUSES),
  attachment: attachmentSchema.nullable(),
  createdAt: z.string(),
  decidedAt: z.string().nullable(),
  // null jika keputusan belum ada atau akun pemutus sudah dicabut dari usaha
  decidedByName: z.string().nullable(),
  decisionNote: z.string().nullable(),
};

export const leaveRequestSchema = z.object(leaveRequestShape);
export type LeaveRequest = z.infer<typeof leaveRequestSchema>;

export const myLeaveRequestsSchema = z.object({
  access: z.enum(ATTENDANCE_ACCESS),
  // Tanggal hari ini di zona waktu usaha (default form)
  today: z.string(),
  month: z.string(),
  // Menunggu + yang belum berakhir + yang beririsan dengan bulan terpilih; terbaru di atas
  requests: z.array(leaveRequestSchema),
  // Hari kerja bulan terpilih yang tertutup pengajuan disetujui — tampil di riwayat absensi
  leaveDays: z.array(z.object({ date: z.string(), type: z.enum(LEAVE_TYPES) })),
  // Jumlah hari kerja per jenis (disetujui) di bulan terpilih
  summary: z.object({ permit: z.number().int(), sick: z.number().int(), leave: z.number().int() }),
});
export type MyLeaveRequests = z.infer<typeof myLeaveRequestsSchema>;

export const leaveRequestListItemSchema = z.object({
  ...leaveRequestShape,
  employee: z.object({ id: z.string(), fullName: z.string(), positionName: z.string() }),
  // Penglihat boleh memutuskan (masih menunggu, bukan pengajuan miliknya sendiri, dalam cakupannya)
  canDecide: z.boolean(),
});
export type LeaveRequestListItem = z.infer<typeof leaveRequestListItemSchema>;

export const leaveRequestListSchema = z.object({
  items: z.array(leaveRequestListItemSchema),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
  // Jumlah menunggu dalam cakupan penglihat (badge tab)
  pendingCount: z.number().int(),
  // all = owner/admin; subordinates = atasan (bawahan langsung)
  scope: z.enum(["all", "subordinates"]),
});
export type LeaveRequestList = z.infer<typeof leaveRequestListSchema>;

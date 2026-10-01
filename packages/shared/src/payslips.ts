import { z } from "zod";

// Slip gaji PDF (feature 31). Slip dibuat otomatis lewat antrean setelah payroll final (satu per karyawan yang dihitung),
// dari snapshot final — angka tidak pernah dihitung ulang. Owner/admin memeriksa lalu MENERBITKAN slip: baru setelah
// terbit karyawan melihatnya di /me/payslips, dan karyawan dengan akun portal dikirimi email berisi tautan (tanpa angka gaji).

export const PAYSLIP_STATUSES = ["pending", "generating", "ready", "failed"] as const;
export type PayslipStatus = (typeof PAYSLIP_STATUSES)[number];

// queued = antre/dikirim worker · sent = terkirim · failed = gagal setelah semua percobaan
export const PAYSLIP_EMAIL_STATUSES = ["queued", "sent", "failed"] as const;
export type PayslipEmailStatus = (typeof PAYSLIP_EMAIL_STATUSES)[number];

// ——— Antrean BullMQ "payslips" (API → apps/worker) ———

export const PAYSLIP_QUEUE_NAME = "payslips";
export const PAYSLIP_GENERATE_JOB = "payslip-generate";
export const PAYSLIP_EMAIL_JOB = "payslip-email";
export const payslipJobDataSchema = z.object({ tenantId: z.uuid(), payslipId: z.uuid() });
export type PayslipJobData = z.infer<typeof payslipJobDataSchema>;

// ——— Output: halaman slip satu periode (owner/admin) ———

export const payslipRowSchema = z.object({
  id: z.string(),
  employee: z.object({
    id: z.string(),
    fullName: z.string(),
    employeeNumber: z.string().nullable(),
  }),
  takeHomePay: z.string(),
  status: z.enum(PAYSLIP_STATUSES),
  // Pesan aman bila gagal dibuat
  error: z.string().nullable(),
  generatedAt: z.string().nullable(),
  publishedAt: z.string().nullable(),
  // Karyawan punya akun portal di usaha ini (tujuan email) — dibaca saat ini, bukan saat terbit
  hasPortalAccount: z.boolean(),
  email: z
    .object({
      status: z.enum(PAYSLIP_EMAIL_STATUSES),
      to: z.string(),
      requestedAt: z.string(),
      sentAt: z.string().nullable(),
      error: z.string().nullable(),
    })
    .nullable(),
});
export type PayslipRow = z.infer<typeof payslipRowSchema>;

export const payslipRunSchema = z.object({
  run: z.object({
    id: z.string(),
    // "2026-10"
    month: z.string(),
    periodStart: z.string(),
    periodEnd: z.string(),
    payDate: z.string().nullable(),
  }),
  // Urut nama
  rows: z.array(payslipRowSchema),
  // Karyawan dikeluarkan dari periode — tidak mendapat slip
  excludedCount: z.number().int(),
});
export type PayslipRun = z.infer<typeof payslipRunSchema>;

export const publishPayslipsResultSchema = z.object({
  published: z.number().int(),
  emailed: z.number().int(),
});
export type PublishPayslipsResult = z.infer<typeof publishPayslipsResultSchema>;

// ——— Output: portal karyawan /me/payslips ———

export const myPayslipSchema = z.object({
  id: z.string(),
  month: z.string(),
  periodStart: z.string(),
  periodEnd: z.string(),
  payDate: z.string().nullable(),
  takeHomePay: z.string(),
  publishedAt: z.string(),
});
export type MyPayslip = z.infer<typeof myPayslipSchema>;

export const myPayslipListSchema = z.discriminatedUnion("access", [
  // Akun belum tertaut ke data karyawan di usaha ini
  z.object({ access: z.literal("not_linked") }),
  // Terbaru dulu, hanya slip yang sudah terbit
  z.object({ access: z.literal("ok"), payslips: z.array(myPayslipSchema) }),
]);
export type MyPayslipList = z.infer<typeof myPayslipListSchema>;

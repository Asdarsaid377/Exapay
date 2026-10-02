import { z } from "zod";

import { moneySchema } from "./money.js";
import { isoDateSchema } from "./workCalendar.js";

// Langganan & trial (Phase 9, feature 39–40).

// Status yang DISIMPAN di tenant_subscriptions:
//   trialing      → masa trial gratis (trial_ends_at)
//   active        → berlangganan, dibayar sampai current_period_ends_at
//   complimentary → gratis tanpa batas (tenant pilot/klien uji coba; diatur super-admin)
export const SUBSCRIPTION_STATUSES = ["trialing", "active", "complimentary"] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

// Status EFEKTIF — dihitung dari tanggal saat dibaca (tanpa cron):
//   past_due  → trial/periode berakhir, masih dalam masa tenggang (tetap bisa dipakai, diingatkan)
//   read_only → masa tenggang lewat: hanya lihat & ekspor sampai lunas
export const EFFECTIVE_SUBSCRIPTION_STATUSES = ["trialing", "active", "complimentary", "past_due", "read_only"] as const;
export type EffectiveSubscriptionStatus = (typeof EFFECTIVE_SUBSCRIPTION_STATUSES)[number];

// Pilihan super-admin saat membuat tenant (feature 07 + 39). Signup mandiri selalu trial.
export const TENANT_SUBSCRIPTION_STARTS = ["trial", "complimentary"] as const;
export type TenantSubscriptionStart = (typeof TENANT_SUBSCRIPTION_STARTS)[number];

// Tanggal langganan (harga berlaku, sisa hari) dihitung di zona waktu platform — sama untuk semua usaha
export const SUBSCRIPTION_TIME_ZONE = "Asia/Jakarta";
const DAY_MS = 24 * 60 * 60 * 1000;

export type SubscriptionRow = {
  status: SubscriptionStatus;
  trialEndsAt: Date | null;
  currentPeriodEndsAt: Date | null;
};

export type SubscriptionState = {
  status: EffectiveSubscriptionStatus;
  // Akhir trial / periode berbayar (null untuk complimentary)
  endsAt: Date | null;
  // Akhir masa tenggang = endsAt + grace_days harga berlaku; setelahnya baca-saja
  graceEndsAt: Date | null;
  // false = mode baca-saja (mutasi ditolak SubscriptionGuard)
  writable: boolean;
};

// Status efektif dari tanggal saat dibaca (feature 39) — tidak bergantung cron, jadi tidak ada jendela di mana usaha
// "lupa" terkunci atau terbuka. Dipakai SubscriptionGuard/BillingService (API) dan pengingat langganan (worker).
export function subscriptionStateAt(row: SubscriptionRow, graceDays: number, now: Date): SubscriptionState {
  if (row.status === "complimentary") return { status: "complimentary", endsAt: null, graceEndsAt: null, writable: true };

  const endsAt = row.status === "trialing" ? row.trialEndsAt : row.currentPeriodEndsAt;
  // CHECK tenant_subscriptions_dates menjamin tanggal ada; data rusak → kunci (gagal aman, bukan gratis tanpa batas)
  if (!endsAt) return { status: "read_only", endsAt: null, graceEndsAt: null, writable: false };

  const graceEndsAt = new Date(endsAt.getTime() + graceDays * DAY_MS);
  if (now < endsAt) return { status: row.status, endsAt, graceEndsAt, writable: true };
  if (now < graceEndsAt) return { status: "past_due", endsAt, graceEndsAt, writable: true };
  return { status: "read_only", endsAt, graceEndsAt, writable: false };
}

// Tanggal kalender (YYYY-MM-DD) di zona platform
export function subscriptionDate(instant: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: SUBSCRIPTION_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(instant);
}

// Sisa hari KALENDER (zona platform) sampai tenggat: 0 = berakhir hari ini, 1 = besok. Negatif = sudah lewat.
export function subscriptionDaysUntil(deadline: Date, now: Date): number {
  return Math.round((Date.parse(subscriptionDate(deadline)) - Date.parse(subscriptionDate(now))) / DAY_MS);
}

// Pengingat langganan (feature 40) — dasar banner AppShell & email worker:
//   trial_h7/h3/h1 → trial berakhir ≤ 7 / ≤ 3 / ≤ 1 hari kalender lagi
//   grace_started  → trial/periode berakhir, masuk masa tenggang (past_due)
//   read_only      → masa tenggang lewat, usaha baca-saja
// Email dikirim sekali per (usaha, jenis, akhir periode) — perpanjangan trial/periode memulai pengingat baru.
export const SUBSCRIPTION_NOTICE_KINDS = ["trial_h7", "trial_h3", "trial_h1", "grace_started", "read_only"] as const;
export type SubscriptionNoticeKind = (typeof SUBSCRIPTION_NOTICE_KINDS)[number];

export const SUBSCRIPTION_TRIAL_NOTICE_DAYS = { trial_h7: 7, trial_h3: 3, trial_h1: 1 } as const;

// Tahap pengingat yang berlaku sekarang (hanya yang paling mendesak). Periode berbayar yang akan berakhir diingatkan
// lewat tagihan (feature 41), bukan di sini.
export function subscriptionNoticeAt(state: SubscriptionState, now: Date): SubscriptionNoticeKind | null {
  if (!state.endsAt) return null;
  if (state.status === "trialing") {
    const days = subscriptionDaysUntil(state.endsAt, now);
    if (days <= SUBSCRIPTION_TRIAL_NOTICE_DAYS.trial_h1) return "trial_h1";
    if (days <= SUBSCRIPTION_TRIAL_NOTICE_DAYS.trial_h3) return "trial_h3";
    if (days <= SUBSCRIPTION_TRIAL_NOTICE_DAYS.trial_h7) return "trial_h7";
    return null;
  }
  if (state.status === "past_due") return "grace_started";
  if (state.status === "read_only") return "read_only";
  return null;
}

// Ringkasan langganan untuk banner AppShell (owner/admin) — GET /billing/status
export const subscriptionSummarySchema = z.object({
  status: z.enum(EFFECTIVE_SUBSCRIPTION_STATUSES),
  // Status tersimpan — membedakan "trial berakhir" dan "langganan berakhir" saat past_due/read_only
  baseStatus: z.enum(SUBSCRIPTION_STATUSES),
  endsAt: z.string().nullable(),
  graceEndsAt: z.string().nullable(),
  // Sisa hari kalender ke tenggat berikutnya: akhir trial/periode (trialing/active) atau akhir tenggang (past_due)
  daysLeft: z.number().int().nullable(),
  notice: z.enum(SUBSCRIPTION_NOTICE_KINDS).nullable(),
});
export type SubscriptionSummary = z.infer<typeof subscriptionSummarySchema>;

// ——— Tagihan & pembayaran QRIS (feature 41) ———

// Status tagihan (disimpan):
//   open                  → menunggu pembayaran (QRIS ditampilkan) sampai due_at
//   awaiting_confirmation → owner menekan "Saya sudah bayar"; menunggu konfirmasi super-admin (feature 42)
//   paid                  → dikonfirmasi lunas (feature 42)
//   expired               → lewat due_at tanpa klaim bayar; worker menerbitkan tagihan baru bila masih diperlukan
// Tagihan open yang sudah lewat due_at ditampilkan "expired" walau worker belum menandainya.
export const BILLING_INVOICE_STATUSES = ["open", "awaiting_confirmation", "paid", "expired"] as const;
export type BillingInvoiceStatus = (typeof BILLING_INVOICE_STATUSES)[number];

// Tagihan terbit H-7 sebelum trial/periode berakhir (keputusan user 2026-10-02) dan berlaku 14 hari kalender
// (sampai akhir hari, zona platform) — tagihan H-7 berlaku sampai akhir masa tenggang 7 hari.
export const BILLING_INVOICE_LEAD_DAYS = 7;
export const BILLING_INVOICE_DUE_DAYS = 14;
// Kode unik (rupiah) yang ditambahkan ke nominal agar pembayaran mudah dicocokkan dengan mutasi merchant
export const BILLING_UNIQUE_CODE_MIN = 1;
export const BILLING_UNIQUE_CODE_MAX = 999;

// Bukti bayar opsional — jenis & batas sama dengan lampiran izin (PDF/JPG/PNG, maks. 5 MB)
export const BILLING_PROOF_MAX_BYTES = 5 * 1024 * 1024;
export const BILLING_PROOF_ACCEPT = ".pdf,.jpg,.jpeg,.png";

// Perlu tagihan baru? Trial/periode berakhir ≤ 7 hari kalender lagi, atau sudah lewat (tenggang/baca-saja).
// Gratis (pilot) tidak pernah ditagih. Worker hanya menerbitkan bila usaha belum punya tagihan open/menunggu konfirmasi.
export function billingInvoiceNeededAt(state: SubscriptionState, now: Date): boolean {
  if (state.status === "complimentary" || !state.endsAt) return false;
  if (state.status === "past_due" || state.status === "read_only") return true;
  return subscriptionDaysUntil(state.endsAt, now) <= BILLING_INVOICE_LEAD_DAYS;
}

// Batas bayar: akhir hari (zona platform) tanggal terbit + 14 hari. Asia/Jakarta tetap UTC+7 (tanpa DST).
export function billingInvoiceDueAt(issuedAt: Date): Date {
  const issueDate = Date.parse(`${subscriptionDate(issuedAt)}T00:00:00Z`);
  const dueDate = new Date(issueDate + BILLING_INVOICE_DUE_DAYS * DAY_MS).toISOString().slice(0, 10);
  return new Date(`${dueDate}T23:59:59.999+07:00`);
}

export const billingInvoiceSchema = z.object({
  id: z.uuid(),
  number: z.string(),
  // Status efektif (open yang lewat due_at → expired)
  status: z.enum(BILLING_INVOICE_STATUSES),
  // Tanggal mulai periode yang ditagih (akhir trial/periode saat tagihan terbit, atau tanggal terbit bila sudah lewat)
  periodStart: z.string(),
  issuedAt: z.string(),
  dueAt: z.string(),
  // Snapshot rincian saat tagihan terbit — tidak berubah walau harga/jumlah karyawan berubah
  pricePerEmployee: z.string(),
  minBilledEmployees: z.number().int(),
  activeEmployees: z.number().int(),
  billedEmployees: z.number().int(),
  baseAmount: z.string(),
  uniqueCode: z.number().int(),
  // Nominal persis yang harus dibayar = baseAmount + uniqueCode
  totalAmount: z.string(),
  claimedAt: z.string().nullable(),
  proof: z.object({ name: z.string(), contentType: z.string(), size: z.number().int() }).nullable(),
  // Feature 42: lunas dikonfirmasi pemilik platform
  paidAt: z.string().nullable(),
  // Laporan bayar terakhir ditolak (tagihan kembali bisa dibayar) — ditampilkan ke owner selama tagihan open
  rejection: z.object({ reason: z.string(), rejectedAt: z.string() }).nullable(),
});
export type BillingInvoice = z.infer<typeof billingInvoiceSchema>;

// Halaman /settings/billing (owner) — GET /billing
export const billingOverviewSchema = z.object({
  subscription: subscriptionSummarySchema,
  // Tagihan yang sedang berjalan (open belum lewat batas, atau menunggu konfirmasi) — null bila tidak ada
  invoice: billingInvoiceSchema.nullable(),
  // QRIS merchant platform terpasang (env QRIS_STATIC_PAYLOAD). false → QR tidak bisa ditampilkan.
  qrisAvailable: z.boolean(),
  // Riwayat tagihan terbaru (termasuk tagihan berjalan), terbaru dulu
  invoices: z.array(billingInvoiceSchema),
  // Estimasi tagihan bulan berikutnya: max(karyawan aktif, minimum) × harga yang berlaku pada tanggal tagihan berikutnya
  estimate: z.object({
    priceDate: z.string(),
    pricePerEmployee: z.string(),
    minBilledEmployees: z.number().int(),
    activeEmployees: z.number().int(),
    billedEmployees: z.number().int(),
    amount: z.string(),
    graceDays: z.number().int(),
  }),
});
export type BillingOverview = z.infer<typeof billingOverviewSchema>;

// Antrean worker "billing": pemindaian harian → satu job pengingat per usaha
export const BILLING_QUEUE_NAME = "billing";
export const BILLING_NOTICE_SCAN_JOB = "billing-notice-scan";
export const BILLING_NOTICE_JOB = "billing-notice";
export const billingNoticeJobDataSchema = z.object({ tenantId: z.uuid() });
export type BillingNoticeJobData = z.infer<typeof billingNoticeJobDataSchema>;

// Feature 41: pemindaian harian yang sama juga menjadwalkan penerbitan tagihan per usaha (payload { tenantId }),
// dan API menambah job pemberitahuan ke pemilik platform saat owner menekan "Saya sudah bayar".
export const BILLING_INVOICE_JOB = "billing-invoice";
export const BILLING_CLAIM_NOTIFY_JOB = "billing-claim-notify";
export const billingClaimNotifyJobDataSchema = z.object({ tenantId: z.uuid(), invoiceId: z.uuid() });
export type BillingClaimNotifyJobData = z.infer<typeof billingClaimNotifyJobDataSchema>;

// ——— Konfirmasi pembayaran & kelola langganan (feature 42) ———

export const BILLING_DECISION_NOTIFY_JOB = "billing-decision-notify";
// Tautan konfirmasi di email pemberitahuan klaim bayar: sekali pakai, berlaku 7 hari
export const BILLING_CONFIRMATION_TOKEN_DAYS = 7;
// Sumber keputusan pembayaran (dicatat di tagihan & audit)
export const BILLING_DECISION_SOURCES = ["dashboard", "email"] as const;
export type BillingDecisionSource = (typeof BILLING_DECISION_SOURCES)[number];

const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;

// Akhir periode baru = +1 bulan KALENDER di zona platform (WIB, UTC+7 tanpa DST), jam sama; tanggal yang tidak ada di
// bulan tujuan dijepit ke hari terakhir (31 Jan → 28/29 Feb). Keputusan user feature 42.
export function addSubscriptionMonth(from: Date): Date {
  const local = new Date(from.getTime() + WIB_OFFSET_MS);
  const year = local.getUTCFullYear();
  const month = local.getUTCMonth() + 1;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const shifted = Date.UTC(year, month, Math.min(local.getUTCDate(), lastDay), local.getUTCHours(), local.getUTCMinutes(), local.getUTCSeconds(), local.getUTCMilliseconds());
  return new Date(shifted - WIB_OFFSET_MS);
}

// Pembayaran dikonfirmasi → periode baru mulai dari akhir trial/periode sebelumnya (masih aktif, trial, atau tenggang),
// atau dari saat konfirmasi bila sudah baca-saja (build-plan feature 42)
export function subscriptionRenewalStart(state: SubscriptionState, now: Date): Date {
  if (state.status === "read_only" || !state.endsAt) return now;
  return state.endsAt;
}

export const rejectPaymentSchema = z.object({
  reason: z.string("Alasan wajib diisi").trim().min(5, "Alasan minimal 5 karakter").max(500, "Alasan maksimal 500 karakter"),
});
export type RejectPaymentInput = z.infer<typeof rejectPaymentSchema>;

// /admin/billing — antrean konfirmasi (lintas usaha, lewat fungsi definer: hanya data tingkat platform)
export const adminBillingQueueItemSchema = z.object({
  invoiceId: z.uuid(),
  tenantId: z.uuid(),
  tenantName: z.string(),
  number: z.string(),
  totalAmount: z.string(),
  uniqueCode: z.number().int(),
  billedEmployees: z.number().int(),
  claimedAt: z.string(),
  dueAt: z.string(),
  hasProof: z.boolean(),
});
export type AdminBillingQueueItem = z.infer<typeof adminBillingQueueItemSchema>;

export const billingPriceVersionSchema = z.object({
  id: z.uuid(),
  pricePerEmployee: z.string(),
  minBilledEmployees: z.number().int(),
  trialDays: z.number().int(),
  graceDays: z.number().int(),
  effectiveFrom: z.string(),
  effectiveTo: z.string().nullable(),
  note: z.string().nullable(),
});
export type BillingPriceVersion = z.infer<typeof billingPriceVersionSchema>;

export const adminBillingOverviewSchema = z.object({
  queue: z.array(adminBillingQueueItemSchema),
  // Versi harga platform, terbaru dulu
  prices: z.array(billingPriceVersionSchema),
  // Tanggal hari ini (zona platform) — versi baru paling cepat berlaku besok
  today: z.string(),
});
export type AdminBillingOverview = z.infer<typeof adminBillingOverviewSchema>;

// Versi harga platform baru (berlaku-tanggal; tagihan yang sudah terbit tidak berubah)
export const billingPriceInputSchema = z.object({
  pricePerEmployee: moneySchema,
  minBilledEmployees: z.coerce.number("Minimum wajib diisi").int("Harus bilangan bulat").min(0, "Minimal 0").max(1000, "Maksimal 1000"),
  trialDays: z.coerce.number("Lama trial wajib diisi").int("Harus bilangan bulat").min(0, "Minimal 0 hari").max(365, "Maksimal 365 hari"),
  graceDays: z.coerce.number("Masa tenggang wajib diisi").int("Harus bilangan bulat").min(0, "Minimal 0 hari").max(90, "Maksimal 90 hari"),
  effectiveFrom: isoDateSchema,
  note: z.string().trim().max(200, "Catatan maksimal 200 karakter").optional(),
});
export type BillingPriceInput = z.infer<typeof billingPriceInputSchema>;

// /admin/tenants/[id] — langganan satu usaha
export const adminTenantSubscriptionSchema = z.object({
  subscription: subscriptionSummarySchema,
  // Harga khusus usaha ini (null = ikut harga platform)
  pricePerEmployeeOverride: z.string().nullable(),
  minBilledEmployeesOverride: z.number().int().nullable(),
  // Harga platform yang berlaku hari ini (pembanding)
  platformPrice: z.object({ pricePerEmployee: z.string(), minBilledEmployees: z.number().int(), trialDays: z.number().int() }),
  // Tagihan berjalan (open/menunggu konfirmasi) — tanpa rincian karyawan
  liveInvoice: z
    .object({ id: z.uuid(), number: z.string(), status: z.enum(BILLING_INVOICE_STATUSES), totalAmount: z.string(), dueAt: z.string() })
    .nullable(),
});
export type AdminTenantSubscription = z.infer<typeof adminTenantSubscriptionSchema>;

export const extendTrialSchema = z.object({
  days: z.coerce.number("Jumlah hari wajib diisi").int("Harus bilangan bulat").min(1, "Minimal 1 hari").max(365, "Maksimal 365 hari"),
});
export type ExtendTrialInput = z.infer<typeof extendTrialSchema>;

// Kosong (null) = ikut harga platform
export const tenantPriceOverrideSchema = z.object({
  pricePerEmployee: moneySchema.nullable(),
  minBilledEmployees: z.number().int("Harus bilangan bulat").min(0, "Minimal 0").max(1000, "Maksimal 1000").nullable(),
});
export type TenantPriceOverrideInput = z.infer<typeof tenantPriceOverrideSchema>;

// Halaman konfirmasi dari tautan email (tanpa login) — token di body, bukan di URL API
export const paymentConfirmationTokenSchema = z.object({ token: z.string().min(20).max(200) });
export type PaymentConfirmationTokenInput = z.infer<typeof paymentConfirmationTokenSchema>;
export const paymentConfirmationRejectSchema = paymentConfirmationTokenSchema.extend(rejectPaymentSchema.shape);
export type PaymentConfirmationRejectInput = z.infer<typeof paymentConfirmationRejectSchema>;

// pending: bisa diputuskan · decided: sudah diputuskan (lunas/ditolak, dari email atau dashboard) · expired: tautan kedaluwarsa
export const PAYMENT_CONFIRMATION_STATES = ["pending", "decided", "expired"] as const;
export const paymentConfirmationSchema = z.object({
  state: z.enum(PAYMENT_CONFIRMATION_STATES),
  tenantName: z.string(),
  number: z.string(),
  totalAmount: z.string(),
  uniqueCode: z.number().int(),
  claimedAt: z.string().nullable(),
  hasProof: z.boolean(),
  invoiceStatus: z.enum(BILLING_INVOICE_STATUSES),
  // Setelah lunas: langganan aktif sampai
  periodEndsAt: z.string().nullable(),
});
export type PaymentConfirmation = z.infer<typeof paymentConfirmationSchema>;

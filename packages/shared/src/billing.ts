import { z } from "zod";

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

// Halaman /settings/billing (owner) — GET /billing. Riwayat tagihan menyusul di feature 41.
export const billingOverviewSchema = z.object({
  subscription: subscriptionSummarySchema,
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

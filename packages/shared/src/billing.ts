// Langganan & trial (Phase 9, feature 39).

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

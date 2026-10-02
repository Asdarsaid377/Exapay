import type { EffectiveSubscriptionStatus, SubscriptionStatus } from "@exapay/shared";

// Status efektif langganan dihitung dari tanggal saat dibaca (feature 39) — tidak bergantung cron, jadi tidak ada
// jendela di mana usaha "lupa" terkunci atau terbuka. Fungsi murni: diuji unit di test/subscription-status.test.ts.

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

const DAY_MS = 24 * 60 * 60 * 1000;

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

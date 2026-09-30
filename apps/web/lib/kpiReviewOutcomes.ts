import type { KpiSettings } from "@exapay/shared";

// Hasil Server Action siklus & penilaian KPI yang dikonsumsi component (client). Pesan error sudah human-readable.
export type KpiReviewActionOutcome = { kind: "error"; message: string } | { kind: "success" };
export type KpiSettingsOutcome = { kind: "error"; message: string } | { kind: "success"; settings: KpiSettings };
export type CreateKpiReviewsOutcome = { kind: "error"; message: string } | { kind: "success"; periodId: string; created: number };

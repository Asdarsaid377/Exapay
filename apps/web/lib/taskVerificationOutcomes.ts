// Hasil Server Action verifikasi tugas untuk Client Component. Pesan error sudah human-readable.
export type TaskDecisionOutcome = { kind: "error"; message: string } | { kind: "success" };

export type BulkApproveOutcome = { kind: "error"; message: string } | { kind: "success"; approved: number; skipped: number };

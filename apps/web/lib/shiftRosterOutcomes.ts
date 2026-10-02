import type { RosterCell, RosterCopyResult } from "@exapay/shared";

// Hasil Server Action master shift & roster (feature 46) untuk Client Component. Pesan error sudah human-readable.
export type ShiftActionOutcome = { kind: "error"; message: string; field?: "name" | "time" } | { kind: "success" };

export type RosterCellOutcome = { kind: "error"; message: string } | { kind: "success"; cell: RosterCell };

export type RosterCopyOutcome = { kind: "error"; message: string } | { kind: "success"; result: RosterCopyResult };

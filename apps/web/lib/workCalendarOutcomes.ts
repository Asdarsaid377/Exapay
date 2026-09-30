import type { WorkSchedule } from "@exapay/shared";

// Hasil Server Action /settings/attendance yang dikonsumsi component (client). Pesan error sudah human-readable.
export type WorkCalendarActionOutcome = { kind: "error"; message: string } | { kind: "success" };

export type SaveWorkScheduleOutcome = { kind: "error"; message: string } | { kind: "success"; schedule: WorkSchedule };

import type { AttendanceRecord } from "@exapay/shared";

// Hasil Server Action absen masuk/pulang yang dikonsumsi AttendanceCard (client). Pesan error sudah human-readable.
export type ClockActionOutcome = { kind: "error"; message: string } | { kind: "success"; record: AttendanceRecord };

import type { EmployeeAttendanceSettings } from "@exapay/shared";

// Hasil Server Action lokasi kerja & tinjauan absensi untuk Client Component. Pesan error sudah human-readable.
export type WorkLocationActionOutcome = { kind: "error"; message: string } | { kind: "success" };

export type AttendanceSettingsOutcome = { kind: "error"; message: string } | { kind: "success"; settings: EmployeeAttendanceSettings };

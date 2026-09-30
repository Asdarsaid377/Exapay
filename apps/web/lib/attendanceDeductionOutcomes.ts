import type { AttendanceDeductionPreview, AttendanceDeductionSettings } from "@exapay/shared";

// Hasil Server Action aturan potongan absensi (feature 17). Pesan error sudah human-readable.
export type SaveDeductionRulesOutcome = { kind: "error"; message: string } | { kind: "success"; settings: AttendanceDeductionSettings };

export type DeductionPreviewOutcome = { kind: "error"; message: string } | { kind: "success"; preview: AttendanceDeductionPreview };

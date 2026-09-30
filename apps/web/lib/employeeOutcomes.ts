import type { EmployeeImportPreview, EmployeeImportResult, RevealedSensitive } from "@exapay/shared";

// Hasil Server Action /employees yang dikonsumsi component (client). Pesan error sudah human-readable.
export type EmployeeActionOutcome = { kind: "error"; message: string } | { kind: "success" };
export type CreateEmployeeOutcome = { kind: "error"; message: string } | { kind: "success"; id: string };
export type RevealOutcome = { kind: "error"; message: string } | { kind: "success"; revealed: RevealedSensitive };
export type ImportPreviewOutcome = { kind: "error"; message: string } | { kind: "success"; preview: EmployeeImportPreview };
export type ImportCommitOutcome = { kind: "error"; message: string } | { kind: "success"; result: EmployeeImportResult };

import type { EmployeeSalaryOverview } from "@exapay/shared";

// Hasil Server Action komponen gaji & gaji karyawan (feature 28). Pesan error sudah human-readable.
export type SalaryActionOutcome = { kind: "error"; message: string } | { kind: "success" };

export type SaveEmployeeSalaryOutcome = { kind: "error"; message: string } | { kind: "success"; overview: EmployeeSalaryOverview };

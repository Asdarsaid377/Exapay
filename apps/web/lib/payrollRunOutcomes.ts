// Hasil Server Action run payroll (feature 29) yang dikonsumsi component (client). Pesan error sudah human-readable.
export type PayrollActionOutcome = { kind: "error"; message: string } | { kind: "success" };
export type OpenPayrollRunOutcome = { kind: "error"; message: string } | { kind: "success"; id: string };

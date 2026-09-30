// Hasil Server Action /kpi/templates yang dikonsumsi component (client). Pesan error sudah human-readable.
export type KpiTemplateActionOutcome = { kind: "error"; message: string } | { kind: "success" };
export type AddBuiltinKpiTemplatesOutcome = { kind: "error"; message: string } | { kind: "success"; added: number };

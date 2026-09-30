// Hasil Server Action /organization yang dikonsumsi component (client). Pesan error sudah human-readable.
export type OrgActionOutcome = { kind: "error"; message: string } | { kind: "success" };

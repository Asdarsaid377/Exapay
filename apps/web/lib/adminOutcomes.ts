// Hasil Server Action panel super-admin yang dikonsumsi component (client). Pesan error sudah human-readable.

export type CreateTenantOutcome = { kind: "error"; message: string } | { kind: "success"; tenantId: string };

export type AdminActionOutcome = { kind: "error"; message: string } | { kind: "success" };

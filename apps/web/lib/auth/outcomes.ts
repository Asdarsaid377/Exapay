import type { TenantMembership } from "@exapay/shared";

// Hasil Server Action auth yang dikonsumsi form (client). Pesan error sudah human-readable.

export type LoginOutcome =
  | { kind: "error"; message: string }
  | { kind: "select-tenant"; tenants: TenantMembership[] }
  | { kind: "success"; redirectTo: string };

export type SelectTenantOutcome = { kind: "error"; message: string } | { kind: "success"; redirectTo: string };

export type SimpleOutcome = { kind: "error"; message: string } | { kind: "invalid-token" } | { kind: "success" };

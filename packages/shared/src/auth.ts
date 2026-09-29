import { z } from "zod";

import type { MembershipRole } from "./roles.js";

// "web": token hanya di cookie httpOnly. "mobile": token juga dikembalikan di body (dipakai sebagai Bearer).
export const AUTH_CLIENTS = ["web", "mobile"] as const;
export type AuthClient = (typeof AUTH_CLIENTS)[number];

export const loginSchema = z.object({
  email: z.email("Format email tidak valid").trim(),
  password: z.string().min(1, "Password wajib diisi"),
  client: z.enum(AUTH_CLIENTS).default("web"),
});
export type LoginInput = z.infer<typeof loginSchema>;

// Web mengirim refresh token lewat cookie; mobile lewat body
export const refreshSchema = z.object({
  refreshToken: z.string().min(1).optional(),
  client: z.enum(AUTH_CLIENTS).default("web"),
});
export type RefreshInput = z.infer<typeof refreshSchema>;

export const switchTenantSchema = refreshSchema.extend({
  tenantId: z.uuid("Tenant tidak valid"),
});
export type SwitchTenantInput = z.infer<typeof switchTenantSchema>;

export type TenantMembership = {
  tenantId: string;
  tenantName: string;
  role: MembershipRole;
};

export type SessionUser = {
  id: string;
  email: string;
  fullName: string;
  isSuperAdmin: boolean;
};

export type AuthSession = {
  user: SessionUser;
  activeTenant: TenantMembership | null;
  tenants: TenantMembership[];
};

export type AuthTokens = {
  accessToken: string;
  refreshToken: string;
};

// Respons login/refresh/switch-tenant. `tokens` hanya ada untuk client "mobile".
export type AuthResult = AuthSession & { tokens?: AuthTokens };

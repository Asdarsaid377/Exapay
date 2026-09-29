import { z } from "zod";

import { MEMBERSHIP_ROLES, type MembershipRole } from "./roles.js";

// Nama cookie sesi web (di-set API, diteruskan oleh web). Dipakai bersama api & web.
export const ACCESS_COOKIE = "exapay_access";
export const REFRESH_COOKIE = "exapay_refresh";

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

export const PASSWORD_MIN_LENGTH = 8;

export const forgotPasswordSchema = z.object({
  email: z.email("Format email tidak valid").trim(),
});
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

const newPasswordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Password minimal ${PASSWORD_MIN_LENGTH} karakter`)
  .max(128, "Password maksimal 128 karakter");

export const resetPasswordSchema = z.object({
  token: z.string().min(1, "Tautan reset tidak valid"),
  password: newPasswordSchema,
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

// Signup owner (feature 05): membuat akun + usaha + membership owner sekaligus
export const signupSchema = z.object({
  fullName: z.string().trim().min(2, "Nama lengkap minimal 2 karakter").max(100, "Nama lengkap maksimal 100 karakter"),
  companyName: z.string().trim().min(2, "Nama usaha minimal 2 karakter").max(120, "Nama usaha maksimal 120 karakter"),
  email: z.email("Format email tidak valid").trim(),
  password: newPasswordSchema,
});
export type SignupInput = z.infer<typeof signupSchema>;

export const verifyEmailSchema = z.object({
  token: z.string().min(1, "Tautan verifikasi tidak valid"),
});
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;

export const resendVerificationSchema = z.object({
  email: z.email("Format email tidak valid").trim(),
});
export type ResendVerificationInput = z.infer<typeof resendVerificationSchema>;

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

// Validasi respons sesi dari API (dipakai web — respons tidak dipercaya begitu saja)
export const authSessionSchema: z.ZodType<AuthSession> = z.object({
  user: z.object({ id: z.string(), email: z.string(), fullName: z.string(), isSuperAdmin: z.boolean() }),
  activeTenant: z.object({ tenantId: z.string(), tenantName: z.string(), role: z.enum(MEMBERSHIP_ROLES) }).nullable(),
  tenants: z.array(z.object({ tenantId: z.string(), tenantName: z.string(), role: z.enum(MEMBERSHIP_ROLES) })),
});

import type { MembershipRole } from "@exapay/shared";
import type { Request } from "express";

import type { TenantContext } from "../../database/tenant-transaction.js";

// User terautentikasi yang ditempel JwtAuthGuard ke request. tenantId/role null jika belum memilih tenant.
export type AuthUser = {
  userId: string;
  isSuperAdmin: boolean;
  tenantId: string | null;
  role: MembershipRole | null;
};

export type AuthenticatedRequest = Request & { user?: AuthUser };

// Payload access token (JWT). Nama klaim pendek agar token kecil.
export type AccessTokenPayload = {
  sub: string;
  tid: string | null;
  role: MembershipRole | null;
  sa: boolean;
};

export const ACCESS_COOKIE = "exapay_access";
export const REFRESH_COOKIE = "exapay_refresh";

// Konteks RLS dari user terautentikasi. Endpoint dengan @Roles sudah menjamin tenant aktif ada.
export function tenantContextOf(user: AuthUser): TenantContext {
  if (!user.tenantId) {
    throw new Error("[auth/tenantContextOf] user belum memilih tenant aktif");
  }
  return { tenantId: user.tenantId, userId: user.userId };
}

// cookie-parser mengisi request.cookies; dibaca defensif karena tipenya longgar
export function readCookie(request: Request, name: string): string | null {
  const cookies: unknown = request.cookies;
  if (typeof cookies !== "object" || cookies === null) return null;
  const value: unknown = Reflect.get(cookies, name);
  return typeof value === "string" && value ? value : null;
}

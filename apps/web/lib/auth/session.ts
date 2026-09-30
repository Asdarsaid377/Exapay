import { MEMBERSHIP_ROLES, type MembershipRole } from "@exapay/shared";

// Isi access token yang relevan untuk routing di web. Token TIDAK diverifikasi di sini —
// verifikasi & otorisasi sesungguhnya selalu di API. Web hanya memakainya untuk memilih halaman.
// Header yang di-set proxy ke request saat refresh sesi gagal karena API tidak terjangkau (bukan karena ditolak).
// getSession() lalu melempar SessionUnavailableError alih-alih mengakhiri sesi.
export const SESSION_UNAVAILABLE_HEADER = "x-exapay-session-unavailable";

export type SessionClaims = {
  userId: string;
  tenantId: string | null;
  role: MembershipRole | null;
  isSuperAdmin: boolean;
  expiresAt: number;
};

function isMembershipRole(value: unknown): value is MembershipRole {
  return typeof value === "string" && (MEMBERSHIP_ROLES as readonly string[]).includes(value);
}

export function readSessionClaims(accessToken: string | undefined): SessionClaims | null {
  if (!accessToken) return null;
  const payloadPart = accessToken.split(".")[1];
  if (!payloadPart) return null;
  try {
    const json: unknown = JSON.parse(atob(payloadPart.replace(/-/g, "+").replace(/_/g, "/")));
    if (typeof json !== "object" || json === null) return null;
    const sub: unknown = Reflect.get(json, "sub");
    const tid: unknown = Reflect.get(json, "tid");
    const role: unknown = Reflect.get(json, "role");
    const sa: unknown = Reflect.get(json, "sa");
    const exp: unknown = Reflect.get(json, "exp");
    if (typeof sub !== "string" || typeof exp !== "number") return null;
    if (exp * 1000 <= Date.now()) return null;
    return {
      userId: sub,
      tenantId: typeof tid === "string" ? tid : null,
      role: isMembershipRole(role) ? role : null,
      isSuperAdmin: sa === true,
      expiresAt: exp * 1000,
    };
  } catch {
    return null;
  }
}

// Halaman awal sesuai peran. null = sudah login tapi belum memilih usaha (tampilkan pilihan di /login).
export function homePathFor(claims: Pick<SessionClaims, "tenantId" | "role" | "isSuperAdmin">): string | null {
  if (claims.tenantId && claims.role) return claims.role === "karyawan" ? "/me" : "/dashboard";
  if (claims.isSuperAdmin) return "/admin/tenants";
  return null;
}

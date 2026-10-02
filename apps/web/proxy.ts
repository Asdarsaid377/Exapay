import { ACCESS_COOKIE, REFRESH_COOKIE } from "@exapay/shared";
import { type NextRequest, NextResponse } from "next/server";

import { apiRequest } from "@/lib/api/server";
import { homePathFor, readSessionClaims, SESSION_UNAVAILABLE_HEADER, type SessionClaims } from "@/lib/auth/session";
import { parseSetCookie } from "@/lib/auth/setCookieHeader";
import { canAccessStaffPath } from "@/lib/navigation";

// Proteksi route web (Next.js 16: pengganti middleware.ts).
// - Access token habis tapi refresh token ada → refresh ke API, cookie baru diteruskan ke browser & request ini
// - Belum login → /login; sudah login → arahkan ke halaman sesuai peran
// Ini hanya routing — API tetap memverifikasi token & peran di setiap request.

// Halaman tanpa login. /login tetap diizinkan untuk user tanpa usaha aktif (langkah pilih usaha).
// /payment: konfirmasi pembayaran dari tautan email pemilik platform (feature 42, token = akses)
// "/" (persis): landing page untuk tamu (feature 43) — pengguna login tetap diarahkan ke halaman sesuai peran
const PUBLIC_PATHS = ["/login", "/forgot-password", "/reset-password", "/signup", "/verify-email", "/invite", "/payment"];

function isPublic(pathname: string): boolean {
  if (pathname === "/") return true;
  return PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

// unavailable: API tidak terjangkau / error 5xx — sesi belum tentu berakhir, cookie JANGAN dihapus
type Refreshed = { claims: SessionClaims | null; setCookies: string[]; unavailable: boolean };

async function refreshSession(refreshToken: string): Promise<Refreshed> {
  const result = await apiRequest("/auth/refresh", () => null, {
    method: "POST",
    body: { client: "web" },
    cookieHeader: `${REFRESH_COOKIE}=${encodeURIComponent(refreshToken)}`,
  });
  if (!result.ok) return { claims: null, setCookies: [], unavailable: result.status === 0 || result.status >= 500 };
  const access = result.setCookies.map(parseSetCookie).find((c) => c?.name === ACCESS_COOKIE);
  return { claims: readSessionClaims(access?.value), setCookies: result.setCookies, unavailable: false };
}

// Allowed-list per area: null = boleh lanjut, string = redirect ke path tsb
function guard(pathname: string, claims: SessionClaims): string | null {
  const home = homePathFor(claims);
  if (pathname === "/") return home ?? "/login";
  if (!home) return pathname === "/login" ? null : "/login"; // belum memilih usaha
  if (pathname === "/login") return home;
  if (pathname.startsWith("/admin")) return claims.isSuperAdmin ? null : home;
  if (pathname === "/me" || pathname.startsWith("/me/")) return claims.tenantId ? null : home;
  // Area owner/admin/atasan: karyawan diarahkan ke portal karyawan; menu di luar peran (mis. atasan → /payroll) ke halaman awal
  if (!claims.role || claims.role === "karyawan") return home;
  return canAccessStaffPath(pathname, claims.role) ? null : home;
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const { pathname, search } = request.nextUrl;
  let claims = readSessionClaims(request.cookies.get(ACCESS_COOKIE)?.value);
  let setCookies: string[] = [];

  const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value;
  if (!claims && refreshToken) {
    const refreshed = await refreshSession(refreshToken);
    if (refreshed.unavailable) {
      // Halaman publik tetap tampil; halaman lain menampilkan "server tidak dapat dihubungi" (app/error.tsx) tanpa logout
      if (isPublic(pathname)) return NextResponse.next();
      request.headers.set(SESSION_UNAVAILABLE_HEADER, "1");
      return NextResponse.next({ request: { headers: request.headers } });
    }
    claims = refreshed.claims;
    setCookies = refreshed.setCookies;
    // Teruskan token baru ke Server Component pada request yang sama
    const access = setCookies.map(parseSetCookie).find((c) => c?.name === ACCESS_COOKIE);
    const refresh = setCookies.map(parseSetCookie).find((c) => c?.name === REFRESH_COOKIE);
    if (access) request.cookies.set(ACCESS_COOKIE, access.value);
    if (refresh) request.cookies.set(REFRESH_COOKIE, refresh.value);
    if (!claims) {
      request.cookies.delete(ACCESS_COOKIE);
      request.cookies.delete(REFRESH_COOKIE);
    }
  }

  let response: NextResponse;
  if (!claims) {
    if (isPublic(pathname)) {
      response = NextResponse.next({ request: { headers: request.headers } });
    } else {
      const loginUrl = new URL("/login", request.url);
      if (pathname !== "/") loginUrl.searchParams.set("next", `${pathname}${search}`);
      response = NextResponse.redirect(loginUrl);
    }
    // Refresh gagal: bersihkan cookie sesi yang sudah tidak berlaku
    if (refreshToken) {
      response.cookies.delete(ACCESS_COOKIE);
      response.cookies.delete(REFRESH_COOKIE);
    }
    return response;
  }

  // Halaman publik tetap bisa dibuka saat login, kecuali /login & landing "/" (diarahkan ke halaman awal peran)
  const target = isPublic(pathname) && pathname !== "/login" && pathname !== "/" ? null : guard(pathname, claims);
  response = target && target !== pathname ? NextResponse.redirect(new URL(target, request.url)) : NextResponse.next({ request: { headers: request.headers } });

  for (const header of setCookies) {
    const cookie = parseSetCookie(header);
    if (!cookie) continue;
    response.cookies.set(cookie.name, cookie.value, {
      httpOnly: cookie.httpOnly,
      secure: cookie.secure,
      sameSite: cookie.sameSite,
      path: cookie.path ?? "/",
      maxAge: cookie.maxAge,
    });
  }
  return response;
}

export const config = {
  // Semua halaman kecuali aset statis & file (ber-ekstensi)
  matcher: ["/((?!_next/static|_next/image|favicon.ico|images/|.*\\.[a-zA-Z0-9]+$).*)"],
};

"use server";

import {
  ACCESS_COOKIE,
  authSessionSchema,
  forgotPasswordSchema,
  loginSchema,
  REFRESH_COOKIE,
  resendVerificationSchema,
  resetPasswordSchema,
  signupSchema,
  type AuthSession,
  type SignupInput,
  verifyEmailSchema,
} from "@exapay/shared";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { apiRequest, sessionCookieHeader } from "@/lib/api/server";
import type { LoginOutcome, SelectTenantOutcome, SimpleOutcome } from "@/lib/auth/outcomes";
import { homePathFor } from "@/lib/auth/session";
import { parseSetCookie } from "@/lib/auth/setCookieHeader";

// Server Action tipis: validasi ulang input, teruskan ke API NestJS, teruskan cookie sesi ke browser.
// Semua keputusan otorisasi tetap di API.

const SESSION_COOKIES = new Set([ACCESS_COOKIE, REFRESH_COOKIE]);
const ignoreData = (): null => null;

async function relayCookies(setCookies: string[]): Promise<void> {
  const store = await cookies();
  for (const header of setCookies) {
    const cookie = parseSetCookie(header);
    if (!cookie || !SESSION_COOKIES.has(cookie.name)) continue;
    if (!cookie.value || cookie.maxAge === 0) {
      store.delete(cookie.name);
      continue;
    }
    store.set(cookie.name, cookie.value, {
      httpOnly: cookie.httpOnly,
      secure: cookie.secure,
      sameSite: cookie.sameSite,
      path: cookie.path ?? "/",
      maxAge: cookie.maxAge,
    });
  }
}

async function currentCookieHeader(): Promise<string | undefined> {
  const store = await cookies();
  return sessionCookieHeader((name) => store.get(name)?.value);
}

function homeOf(session: AuthSession): string | null {
  return homePathFor({
    tenantId: session.activeTenant?.tenantId ?? null,
    role: session.activeTenant?.role ?? null,
    isSuperAdmin: session.user.isSuperAdmin,
  });
}

function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Input tidak valid";
}

export async function login(input: { email: string; password: string }): Promise<LoginOutcome> {
  const parsed = loginSchema.safeParse({ ...input, client: "web" });
  if (!parsed.success) return { kind: "error", message: firstIssue(parsed.error) };

  const result = await apiRequest("/auth/login", (data) => authSessionSchema.parse(data), { method: "POST", body: parsed.data });
  // 403: password benar tapi email belum diverifikasi
  if (!result.ok && result.status === 403) return { kind: "unverified", email: parsed.data.email, message: result.error };
  if (!result.ok) return { kind: "error", message: result.error };

  const session = result.data;
  const home = homeOf(session);
  if (home) {
    await relayCookies(result.setCookies);
    return { kind: "success", redirectTo: home };
  }
  if (session.tenants.length > 1) {
    await relayCookies(result.setCookies);
    return { kind: "select-tenant", tenants: session.tenants };
  }

  // Login benar tapi tidak tergabung di usaha mana pun: sesi yang baru dibuat langsung dicabut
  const refresh = result.setCookies.map(parseSetCookie).find((c) => c?.name === REFRESH_COOKIE);
  if (refresh) await apiRequest("/auth/logout", ignoreData, { method: "POST", body: { refreshToken: refresh.value } });
  return { kind: "error", message: "Akun Anda belum terhubung ke usaha mana pun. Hubungi pemilik usaha Anda." };
}

export async function selectTenant(tenantId: string): Promise<SelectTenantOutcome> {
  const parsed = z.uuid().safeParse(tenantId);
  if (!parsed.success) return { kind: "error", message: "Usaha tidak valid" };

  const result = await apiRequest("/auth/switch-tenant", (data) => authSessionSchema.parse(data), {
    method: "POST",
    body: { tenantId: parsed.data, client: "web" },
    cookieHeader: await currentCookieHeader(),
  });
  if (!result.ok) return { kind: "error", message: result.error };

  await relayCookies(result.setCookies);
  return { kind: "success", redirectTo: homeOf(result.data) ?? "/login" };
}

export async function requestPasswordReset(email: string): Promise<SimpleOutcome> {
  const parsed = forgotPasswordSchema.safeParse({ email });
  if (!parsed.success) return { kind: "error", message: firstIssue(parsed.error) };

  const result = await apiRequest("/auth/forgot-password", ignoreData, { method: "POST", body: parsed.data });
  return result.ok ? { kind: "success" } : { kind: "error", message: result.error };
}

export async function resetPassword(token: string, password: string): Promise<SimpleOutcome> {
  const parsed = resetPasswordSchema.safeParse({ token, password });
  if (!parsed.success) return { kind: "error", message: firstIssue(parsed.error) };

  const result = await apiRequest("/auth/reset-password", ignoreData, { method: "POST", body: parsed.data });
  if (result.ok) return { kind: "success" };
  // 410: tautan tidak valid / kedaluwarsa / sudah dipakai
  return result.status === 410 ? { kind: "invalid-token" } : { kind: "error", message: result.error };
}

// Respons API sama untuk email baru maupun terdaftar; sesi tidak dibuat (login setelah verifikasi)
export async function signup(input: SignupInput): Promise<SimpleOutcome> {
  const parsed = signupSchema.safeParse(input);
  if (!parsed.success) return { kind: "error", message: firstIssue(parsed.error) };

  const result = await apiRequest("/auth/signup", ignoreData, { method: "POST", body: parsed.data });
  return result.ok ? { kind: "success" } : { kind: "error", message: result.error };
}

export async function verifyEmail(token: string): Promise<SimpleOutcome> {
  const parsed = verifyEmailSchema.safeParse({ token });
  if (!parsed.success) return { kind: "invalid-token" };

  const result = await apiRequest("/auth/verify-email", ignoreData, { method: "POST", body: parsed.data });
  if (result.ok) return { kind: "success" };
  // 410: tautan tidak valid / kedaluwarsa
  return result.status === 410 ? { kind: "invalid-token" } : { kind: "error", message: result.error };
}

export async function resendVerification(email: string): Promise<SimpleOutcome> {
  const parsed = resendVerificationSchema.safeParse({ email });
  if (!parsed.success) return { kind: "error", message: firstIssue(parsed.error) };

  const result = await apiRequest("/auth/resend-verification", ignoreData, { method: "POST", body: parsed.data });
  return result.ok ? { kind: "success" } : { kind: "error", message: result.error };
}

export async function logout(): Promise<never> {
  const result = await apiRequest("/auth/logout", ignoreData, { method: "POST", body: {}, cookieHeader: await currentCookieHeader() });
  await relayCookies(result.setCookies);
  // Tetap hapus di sisi web walau API gagal dihubungi
  const store = await cookies();
  store.delete(ACCESS_COOKIE);
  store.delete(REFRESH_COOKIE);
  redirect("/login");
}

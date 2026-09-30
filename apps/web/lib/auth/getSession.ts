import { authSessionSchema, type AuthSession } from "@exapay/shared";
import { cookies, headers } from "next/headers";
import { cache } from "react";

import { apiRequest, sessionCookieHeader } from "@/lib/api/server";
import { SESSION_UNAVAILABLE_HEADER } from "@/lib/auth/session";

// API tidak bisa memastikan sesi (jaringan putus, API restart, error 5xx). Sesi TIDAK dianggap berakhir —
// ditangkap app/error.tsx (tombol coba lagi). Jangan diperlakukan seperti null: null berarti logout.
export class SessionUnavailableError extends Error {
  constructor() {
    super("Server Exapay sedang tidak dapat dihubungi");
    this.name = "SessionUnavailableError";
  }
}

// Sesi user saat ini dari API (Server Component).
// null = belum login / sesi DITOLAK API (401/403) → boleh diakhiri. Gangguan server → SessionUnavailableError.
// cache(): layout & page pada request yang sama hanya memanggil API sekali.
export const getSession = cache(async function getSession(): Promise<AuthSession | null> {
  const requestHeaders = await headers();
  if (requestHeaders.get(SESSION_UNAVAILABLE_HEADER)) throw new SessionUnavailableError();

  const store = await cookies();
  const cookieHeader = sessionCookieHeader((name) => store.get(name)?.value);
  if (!cookieHeader) return null;

  const result = await apiRequest("/auth/me", (data) => authSessionSchema.parse(data), { cookieHeader });
  if (result.ok) return result.data;
  if (result.status === 401 || result.status === 403) return null;
  throw new SessionUnavailableError();
});

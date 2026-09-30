import { authSessionSchema, type AuthSession } from "@exapay/shared";
import { cookies } from "next/headers";
import { cache } from "react";

import { apiRequest, sessionCookieHeader } from "@/lib/api/server";

// Sesi user saat ini dari API (Server Component). null jika belum login / sesi tidak valid.
// cache(): layout & page pada request yang sama hanya memanggil API sekali.
export const getSession = cache(async function getSession(): Promise<AuthSession | null> {
  const store = await cookies();
  const cookieHeader = sessionCookieHeader((name) => store.get(name)?.value);
  if (!cookieHeader) return null;

  const result = await apiRequest("/auth/me", (data) => authSessionSchema.parse(data), { cookieHeader });
  return result.ok ? result.data : null;
});

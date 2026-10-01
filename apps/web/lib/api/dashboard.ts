import { type OwnerDashboard, ownerDashboardSchema } from "@exapay/shared";
import { cookies } from "next/headers";

import { type ApiResult, apiRequest, sessionCookieHeader } from "@/lib/api/server";

// Dashboard owner/admin (feature 35): /dashboard

async function cookieHeader(): Promise<string | undefined> {
  const store = await cookies();
  return sessionCookieHeader((name) => store.get(name)?.value);
}

export async function fetchOwnerDashboard(): Promise<ApiResult<OwnerDashboard>> {
  return apiRequest("/dashboard", (data) => ownerDashboardSchema.parse(data), { cookieHeader: await cookieHeader() });
}

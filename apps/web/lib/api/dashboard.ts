import { type OwnerDashboard, ownerDashboardSchema, type SupervisorDashboard, supervisorDashboardSchema } from "@exapay/shared";
import { cookies } from "next/headers";

import { type ApiResult, apiRequest, sessionCookieHeader } from "@/lib/api/server";

// Dashboard owner/admin (feature 35): /dashboard · atasan (feature 36): /dashboard/team

async function cookieHeader(): Promise<string | undefined> {
  const store = await cookies();
  return sessionCookieHeader((name) => store.get(name)?.value);
}

export async function fetchOwnerDashboard(): Promise<ApiResult<OwnerDashboard>> {
  return apiRequest("/dashboard", (data) => ownerDashboardSchema.parse(data), { cookieHeader: await cookieHeader() });
}

export async function fetchSupervisorDashboard(): Promise<ApiResult<SupervisorDashboard>> {
  return apiRequest("/dashboard/team", (data) => supervisorDashboardSchema.parse(data), { cookieHeader: await cookieHeader() });
}

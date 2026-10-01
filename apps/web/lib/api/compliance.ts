import { type ComplianceCalendar, complianceCalendarSchema } from "@exapay/shared";
import { cookies } from "next/headers";

import { type ApiResult, apiRequest, sessionCookieHeader } from "@/lib/api/server";

// Kalender kepatuhan (feature 33): /compliance

async function cookieHeader(): Promise<string | undefined> {
  const store = await cookies();
  return sessionCookieHeader((name) => store.get(name)?.value);
}

// month null = bulan berjalan (ditentukan API, zona waktu usaha)
export async function fetchComplianceCalendar(month: string | null): Promise<ApiResult<ComplianceCalendar>> {
  return apiRequest(`/compliance${month ? `?month=${month}` : ""}`, (data) => complianceCalendarSchema.parse(data), { cookieHeader: await cookieHeader() });
}

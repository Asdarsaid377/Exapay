import { type HolidayOverview, holidayOverviewSchema, type WorkSchedule, workScheduleSchema } from "@exapay/shared";
import { cookies } from "next/headers";

import { type ApiResult, apiRequest, sessionCookieHeader } from "@/lib/api/server";

// Jadwal kerja & hari libur untuk Server Component (/settings/attendance)

async function cookieHeader(): Promise<string | undefined> {
  const store = await cookies();
  return sessionCookieHeader((name) => store.get(name)?.value);
}

export async function fetchWorkSchedule(): Promise<ApiResult<WorkSchedule>> {
  return apiRequest("/attendance/schedule", (data) => workScheduleSchema.parse(data), { cookieHeader: await cookieHeader() });
}

export async function fetchHolidayOverview(year: number): Promise<ApiResult<HolidayOverview>> {
  return apiRequest(`/attendance/holidays?year=${year}`, (data) => holidayOverviewSchema.parse(data), { cookieHeader: await cookieHeader() });
}

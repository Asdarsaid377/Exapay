import { type MySchedule, myScheduleSchema, type RosterQuery, type RosterWeek, rosterWeekSchema, type WorkShiftList, workShiftListSchema } from "@exapay/shared";
import { cookies } from "next/headers";
import { cache } from "react";

import { type ApiResult, apiRequest, sessionCookieHeader } from "@/lib/api/server";

// Master shift, roster, dan "Jadwal saya" (feature 46)

async function cookieHeader(): Promise<string | undefined> {
  const store = await cookies();
  return sessionCookieHeader((name) => store.get(name)?.value);
}

// Satu kali per request (layout menu + halaman)
export const fetchWorkShifts = cache(async (): Promise<ApiResult<WorkShiftList>> => {
  return apiRequest("/attendance/shifts", (data) => workShiftListSchema.parse(data), { cookieHeader: await cookieHeader() });
});

export async function fetchRosterWeek(query: RosterQuery): Promise<ApiResult<RosterWeek>> {
  const params = new URLSearchParams();
  if (query.week) params.set("week", query.week);
  if (query.departmentId) params.set("departmentId", query.departmentId);
  const search = params.toString();
  return apiRequest(`/attendance/roster${search ? `?${search}` : ""}`, (data) => rosterWeekSchema.parse(data), { cookieHeader: await cookieHeader() });
}

export async function fetchMySchedule(): Promise<ApiResult<MySchedule>> {
  return apiRequest("/attendance/me/schedule", (data) => myScheduleSchema.parse(data), { cookieHeader: await cookieHeader() });
}

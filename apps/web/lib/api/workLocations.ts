import {
  type AttendanceReviewList,
  type AttendanceReviewListQuery,
  attendanceReviewListSchema,
  type EmployeeAttendanceSettings,
  employeeAttendanceSettingsSchema,
  type WorkLocationOverview,
  workLocationOverviewSchema,
} from "@exapay/shared";
import { cookies } from "next/headers";

import { type ApiResult, apiRequest, sessionCookieHeader } from "@/lib/api/server";

// Lokasi kerja, pengaturan absen per karyawan, dan tinjauan absen bertanda (feature 44)

async function cookieHeader(): Promise<string | undefined> {
  const store = await cookies();
  return sessionCookieHeader((name) => store.get(name)?.value);
}

export async function fetchWorkLocations(): Promise<ApiResult<WorkLocationOverview>> {
  return apiRequest("/attendance/locations", (data) => workLocationOverviewSchema.parse(data), { cookieHeader: await cookieHeader() });
}

export async function fetchEmployeeAttendanceSettings(employeeId: string): Promise<ApiResult<EmployeeAttendanceSettings>> {
  return apiRequest(`/employees/${employeeId}/attendance-settings`, (data) => employeeAttendanceSettingsSchema.parse(data), {
    cookieHeader: await cookieHeader(),
  });
}

export async function fetchAttendanceReviews(query: AttendanceReviewListQuery): Promise<ApiResult<AttendanceReviewList>> {
  const params = new URLSearchParams({ status: query.status, flag: query.flag, page: String(query.page) });
  if (query.month) params.set("month", query.month);
  return apiRequest(`/attendance/reviews?${params.toString()}`, (data) => attendanceReviewListSchema.parse(data), { cookieHeader: await cookieHeader() });
}

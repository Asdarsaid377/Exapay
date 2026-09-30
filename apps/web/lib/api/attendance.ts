import { type AttendanceHistory, attendanceHistorySchema, type AttendanceToday, attendanceTodaySchema } from "@exapay/shared";
import { cookies } from "next/headers";

import { type ApiResult, apiRequest, sessionCookieHeader } from "@/lib/api/server";

// Absen milik sendiri untuk Server Component portal (/me, /me/attendance)

async function cookieHeader(): Promise<string | undefined> {
  const store = await cookies();
  return sessionCookieHeader((name) => store.get(name)?.value);
}

export async function fetchAttendanceToday(): Promise<ApiResult<AttendanceToday>> {
  return apiRequest("/attendance/me/today", (data) => attendanceTodaySchema.parse(data), { cookieHeader: await cookieHeader() });
}

// month YYYY-MM (sudah divalidasi pemanggil); tanpa bulan → bulan berjalan di zona waktu usaha
export async function fetchAttendanceHistory(month: string | null): Promise<ApiResult<AttendanceHistory>> {
  const query = month ? `?month=${month}` : "";
  return apiRequest(`/attendance/me/history${query}`, (data) => attendanceHistorySchema.parse(data), { cookieHeader: await cookieHeader() });
}

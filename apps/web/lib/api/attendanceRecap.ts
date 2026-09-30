import {
  type AttendanceCorrectionList,
  type AttendanceCorrectionListQuery,
  attendanceCorrectionListSchema,
  type AttendancePeriodQuery,
  type AttendanceRecap,
  attendanceRecapSchema,
  type EmployeeAttendanceDays,
  employeeAttendanceDaysSchema,
} from "@exapay/shared";
import { cookies } from "next/headers";

import { type ApiResult, apiRequest, sessionCookieHeader } from "@/lib/api/server";

// Rekap & koreksi absensi (feature 16): /attendance, /attendance/corrections

async function cookieHeader(): Promise<string | undefined> {
  const store = await cookies();
  return sessionCookieHeader((name) => store.get(name)?.value);
}

// Periode sudah divalidasi pemanggil; kosong → bulan berjalan di zona waktu usaha
function periodParams(period: AttendancePeriodQuery): URLSearchParams {
  const params = new URLSearchParams();
  if (period.from && period.to) {
    params.set("from", period.from);
    params.set("to", period.to);
  } else if (period.month) {
    params.set("month", period.month);
  }
  return params;
}

function withQuery(path: string, params: URLSearchParams): string {
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

export async function fetchAttendanceRecap(period: AttendancePeriodQuery): Promise<ApiResult<AttendanceRecap>> {
  return apiRequest(withQuery("/attendance/recap", periodParams(period)), (data) => attendanceRecapSchema.parse(data), { cookieHeader: await cookieHeader() });
}

export async function fetchEmployeeAttendanceDays(employeeId: string, period: AttendancePeriodQuery): Promise<ApiResult<EmployeeAttendanceDays>> {
  return apiRequest(withQuery(`/attendance/recap/${encodeURIComponent(employeeId)}`, periodParams(period)), (data) => employeeAttendanceDaysSchema.parse(data), {
    cookieHeader: await cookieHeader(),
  });
}

export async function fetchAttendanceCorrections(query: AttendanceCorrectionListQuery): Promise<ApiResult<AttendanceCorrectionList>> {
  const params = new URLSearchParams({ page: String(query.page) });
  if (query.employeeId) params.set("employeeId", query.employeeId);
  return apiRequest(`/attendance/corrections?${params.toString()}`, (data) => attendanceCorrectionListSchema.parse(data), { cookieHeader: await cookieHeader() });
}

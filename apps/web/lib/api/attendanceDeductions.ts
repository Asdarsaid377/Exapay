import { type AttendanceDeductionSettings, attendanceDeductionSettingsSchema } from "@exapay/shared";
import { cookies } from "next/headers";

import { type ApiResult, apiRequest, sessionCookieHeader } from "@/lib/api/server";

// Aturan potongan absensi (feature 17) untuk Server Component /settings/attendance
export async function fetchAttendanceDeductionSettings(): Promise<ApiResult<AttendanceDeductionSettings>> {
  const store = await cookies();
  return apiRequest("/attendance/deduction-rules", (data) => attendanceDeductionSettingsSchema.parse(data), {
    cookieHeader: sessionCookieHeader((name) => store.get(name)?.value),
  });
}

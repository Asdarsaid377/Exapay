import { type TaskVerificationList, type TaskVerificationQuery, taskVerificationListSchema } from "@exapay/shared";
import { cookies } from "next/headers";

import { type ApiResult, apiRequest, sessionCookieHeader } from "@/lib/api/server";

// Verifikasi catatan tugas (feature 20, /kpi/verification). Foto bukti memakai taskPhotoResponse (lib/api/taskLogs).
export async function fetchTaskVerification(query: TaskVerificationQuery): Promise<ApiResult<TaskVerificationList>> {
  const store = await cookies();
  const params = new URLSearchParams({ status: query.status, page: String(query.page) });
  return apiRequest(`/tasks/verification?${params.toString()}`, (data) => taskVerificationListSchema.parse(data), {
    cookieHeader: sessionCookieHeader((name) => store.get(name)?.value),
  });
}

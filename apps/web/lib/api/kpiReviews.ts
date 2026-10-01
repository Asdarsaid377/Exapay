import {
  type EmployeeKpiReview,
  employeeKpiReviewListSchema,
  type KpiReviewDetail,
  kpiReviewDetailSchema,
  type KpiReviewList,
  kpiReviewListSchema,
  type KpiSettings,
  kpiSettingsSchema,
  type MyKpiReviewList,
  myKpiReviewListSchema,
} from "@exapay/shared";
import { cookies } from "next/headers";

import { type ApiResult, apiRequest, sessionCookieHeader } from "@/lib/api/server";

// Siklus & penilaian KPI periodik (feature 22): /settings/kpi, /kpi/reviews, /kpi/reviews/[id]

async function cookieHeader(): Promise<string | undefined> {
  const store = await cookies();
  return sessionCookieHeader((name) => store.get(name)?.value);
}

export async function fetchKpiSettings(): Promise<ApiResult<KpiSettings>> {
  return apiRequest("/kpi/settings", (data) => kpiSettingsSchema.parse(data), { cookieHeader: await cookieHeader() });
}

// periodId sudah divalidasi (uuid); null → periode terbaru
export async function fetchKpiReviews(periodId: string | null): Promise<ApiResult<KpiReviewList>> {
  return apiRequest(`/kpi/reviews${periodId ? `?period=${periodId}` : ""}`, (data) => kpiReviewListSchema.parse(data), { cookieHeader: await cookieHeader() });
}

export async function fetchKpiReview(id: string): Promise<ApiResult<KpiReviewDetail>> {
  return apiRequest(`/kpi/reviews/${id}`, (data) => kpiReviewDetailSchema.parse(data), { cookieHeader: await cookieHeader() });
}

// Penilaian final milik sendiri (portal /me/performance, feature 37)
export async function fetchMyKpiReviews(): Promise<ApiResult<MyKpiReviewList>> {
  return apiRequest("/kpi/me/reviews", (data) => myKpiReviewListSchema.parse(data), { cookieHeader: await cookieHeader() });
}

// Riwayat penilaian satu karyawan — tab KPI detail karyawan (feature 37b)
export async function fetchEmployeeKpiReviews(employeeId: string): Promise<ApiResult<EmployeeKpiReview[]>> {
  return apiRequest(`/kpi/employees/${employeeId}/reviews`, (data) => employeeKpiReviewListSchema.parse(data), { cookieHeader: await cookieHeader() });
}

import {
  type KpiReviewDetail,
  kpiReviewDetailSchema,
  type KpiReviewList,
  kpiReviewListSchema,
  type KpiSettings,
  kpiSettingsSchema,
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

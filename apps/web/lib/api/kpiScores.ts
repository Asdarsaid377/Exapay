import { type KpiScoreList, kpiScoreListSchema, type KpiScoreQuery, type MyKpiScore, myKpiScoreSchema } from "@exapay/shared";
import { cookies } from "next/headers";

import { type ApiResult, apiRequest, sessionCookieHeader } from "@/lib/api/server";

// Skor KPI ad-hoc (feature 21): /kpi/scores (owner/admin/atasan) & /me/performance (milik sendiri)

async function cookieHeader(): Promise<string | undefined> {
  const store = await cookies();
  return sessionCookieHeader((name) => store.get(name)?.value);
}

// Query sudah divalidasi pemanggil; tanpa periode → bulan berjalan di zona waktu usaha
export async function fetchKpiScores(query: KpiScoreQuery): Promise<ApiResult<KpiScoreList>> {
  const params = new URLSearchParams();
  if (query.from && query.to) {
    params.set("from", query.from);
    params.set("to", query.to);
  } else if (query.month) {
    params.set("month", query.month);
  }
  if (query.departmentId) params.set("departmentId", query.departmentId);
  const search = params.toString();
  return apiRequest(`/kpi/scores${search ? `?${search}` : ""}`, (data) => kpiScoreListSchema.parse(data), { cookieHeader: await cookieHeader() });
}

// month YYYY-MM (sudah divalidasi); null → bulan berjalan
export async function fetchMyKpiScore(month: string | null): Promise<ApiResult<MyKpiScore>> {
  return apiRequest(`/kpi/scores/me${month ? `?month=${month}` : ""}`, (data) => myKpiScoreSchema.parse(data), { cookieHeader: await cookieHeader() });
}

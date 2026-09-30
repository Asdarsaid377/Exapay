import { type KpiTemplateOverview, kpiTemplateOverviewSchema } from "@exapay/shared";
import { cookies } from "next/headers";

import { type ApiResult, apiRequest, sessionCookieHeader } from "@/lib/api/server";

// Template KPI + jabatan usaha untuk Server Component (/kpi/templates, editor)
export async function fetchKpiTemplates(): Promise<ApiResult<KpiTemplateOverview>> {
  const store = await cookies();
  return apiRequest("/kpi/templates", (data) => kpiTemplateOverviewSchema.parse(data), {
    cookieHeader: sessionCookieHeader((name) => store.get(name)?.value),
  });
}

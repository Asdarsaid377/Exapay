import {
  type AdminTenantDetail,
  adminTenantDetailSchema,
  type AdminTenantList,
  type AdminTenantListQuery,
  adminTenantListSchema,
} from "@exapay/shared";
import { cookies } from "next/headers";

import { type ApiResult, apiRequest, sessionCookieHeader } from "@/lib/api/server";

// Data panel super-admin untuk Server Component (meneruskan cookie sesi ke API)

async function cookieHeader(): Promise<string | undefined> {
  const store = await cookies();
  return sessionCookieHeader((name) => store.get(name)?.value);
}

export async function fetchAdminTenants(query: AdminTenantListQuery): Promise<ApiResult<AdminTenantList>> {
  const params = new URLSearchParams({ q: query.q, status: query.status, page: String(query.page) });
  return apiRequest(`/admin/tenants?${params.toString()}`, (data) => adminTenantListSchema.parse(data), { cookieHeader: await cookieHeader() });
}

export async function fetchAdminTenant(tenantId: string): Promise<ApiResult<AdminTenantDetail>> {
  return apiRequest(`/admin/tenants/${encodeURIComponent(tenantId)}`, (data) => adminTenantDetailSchema.parse(data), {
    cookieHeader: await cookieHeader(),
  });
}

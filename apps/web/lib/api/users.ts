import { type TenantUsersOverview, tenantUsersOverviewSchema } from "@exapay/shared";
import { cookies } from "next/headers";

import { type ApiResult, apiRequest, sessionCookieHeader } from "@/lib/api/server";

// Pengguna & undangan usaha aktif untuk Server Component (/settings/users)
export async function fetchTenantUsers(): Promise<ApiResult<TenantUsersOverview>> {
  const store = await cookies();
  return apiRequest("/users", (data) => tenantUsersOverviewSchema.parse(data), {
    cookieHeader: sessionCookieHeader((name) => store.get(name)?.value),
  });
}

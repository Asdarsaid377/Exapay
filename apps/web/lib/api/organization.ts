import { type Organization, organizationSchema } from "@exapay/shared";
import { cookies } from "next/headers";

import { type ApiResult, apiRequest, sessionCookieHeader } from "@/lib/api/server";

// Departemen & jabatan untuk Server Component (/organization)
export async function fetchOrganization(): Promise<ApiResult<Organization>> {
  const store = await cookies();
  return apiRequest("/organization", (data) => organizationSchema.parse(data), {
    cookieHeader: sessionCookieHeader((name) => store.get(name)?.value),
  });
}

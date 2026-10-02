import { type AdminBillingOverview, adminBillingOverviewSchema, type AdminTenantSubscription, adminTenantSubscriptionSchema } from "@exapay/shared";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { type ApiResult, apiFetchFile, apiRequest, sessionCookieHeader } from "@/lib/api/server";

// Panel super-admin tagihan & langganan (feature 42): /admin/billing dan langganan di /admin/tenants/[id]

async function cookieHeader(): Promise<string | undefined> {
  const store = await cookies();
  return sessionCookieHeader((name) => store.get(name)?.value);
}

export async function fetchAdminBilling(): Promise<ApiResult<AdminBillingOverview>> {
  return apiRequest("/admin/billing", (data) => adminBillingOverviewSchema.parse(data), { cookieHeader: await cookieHeader() });
}

export async function fetchAdminTenantSubscription(tenantId: string): Promise<ApiResult<AdminTenantSubscription>> {
  return apiRequest(`/admin/tenants/${encodeURIComponent(tenantId)}/subscription`, (data) => adminTenantSubscriptionSchema.parse(data), {
    cookieHeader: await cookieHeader(),
  });
}

// Bukti bayar untuk Route Handler; gagal → kembali ke /admin/billing?proof=error
export async function adminProofResponse(tenantId: string, invoiceId: string, fallbackUrl: URL): Promise<Response> {
  const response = await apiFetchFile(`/admin/tenants/${encodeURIComponent(tenantId)}/invoices/${encodeURIComponent(invoiceId)}/proof`, await cookieHeader());
  return fileOrRedirect(response, fallbackUrl, "proof");
}

export function fileOrRedirect(response: Response | null, fallbackUrl: URL, flag: string): Response {
  if (!response?.ok || !response.body) {
    fallbackUrl.searchParams.set(flag, "error");
    return NextResponse.redirect(fallbackUrl);
  }
  return new Response(response.body, {
    headers: {
      "Content-Type": response.headers.get("content-type") ?? "application/octet-stream",
      "Content-Disposition": response.headers.get("content-disposition") ?? "inline",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

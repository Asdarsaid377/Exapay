import { type BillingOverview, billingOverviewSchema, type SubscriptionSummary, subscriptionSummarySchema } from "@exapay/shared";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { type ApiResult, apiFetchFile, apiRequest, sessionCookieHeader } from "@/lib/api/server";

// Langganan (feature 40): /settings/billing (owner) & banner pengingat di layout area usaha (owner/admin).
// Tagihan & QRIS (feature 41).

async function cookieHeader(): Promise<string | undefined> {
  const store = await cookies();
  return sessionCookieHeader((name) => store.get(name)?.value);
}

export async function fetchBillingOverview(): Promise<ApiResult<BillingOverview>> {
  return apiRequest("/billing", (data) => billingOverviewSchema.parse(data), { cookieHeader: await cookieHeader() });
}

export async function fetchSubscriptionStatus(): Promise<ApiResult<SubscriptionSummary>> {
  return apiRequest("/billing/status", (data) => subscriptionSummarySchema.parse(data), { cookieHeader: await cookieHeader() });
}

// QRIS (PNG) tagihan untuk Route Handler. Gagal (tagihan tidak bisa dibayar / QRIS belum dipasang) → kembali ke halaman
// langganan dengan ?qris=error
export async function invoiceQrResponse(invoiceId: string, download: boolean, fallbackUrl: URL): Promise<Response> {
  const response = await apiFetchFile(`/billing/invoices/${encodeURIComponent(invoiceId)}/qris`, await cookieHeader());
  if (!response?.ok || !response.body) {
    fallbackUrl.searchParams.set("qris", "error");
    return NextResponse.redirect(fallbackUrl);
  }
  const disposition = response.headers.get("content-disposition") ?? 'inline; filename="QRIS.png"';
  return new Response(response.body, {
    headers: {
      "Content-Type": "image/png",
      "Content-Disposition": download ? disposition.replace(/^inline/, "attachment") : disposition,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

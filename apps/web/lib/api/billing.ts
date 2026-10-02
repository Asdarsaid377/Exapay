import { type BillingOverview, billingOverviewSchema, type SubscriptionSummary, subscriptionSummarySchema } from "@exapay/shared";
import { cookies } from "next/headers";

import { type ApiResult, apiRequest, sessionCookieHeader } from "@/lib/api/server";

// Langganan (feature 40): /settings/billing (owner) & banner pengingat di layout area usaha (owner/admin)

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

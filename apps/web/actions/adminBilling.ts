"use server";

import {
  type BillingPriceInput,
  billingPriceInputSchema,
  extendTrialSchema,
  rejectPaymentSchema,
  type TenantPriceOverrideInput,
  tenantPriceOverrideSchema,
} from "@exapay/shared";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod";

import type { AdminActionOutcome } from "@/lib/adminOutcomes";
import { apiRequest, sessionCookieHeader } from "@/lib/api/server";

// Server Action tipis panel super-admin tagihan & langganan (feature 42): validasi ulang → API → revalidate.

const ignoreData = (): null => null;
const INVALID: AdminActionOutcome = { kind: "error", message: "Data tidak valid" };

async function send(path: string, body: unknown, method: "POST" | "PUT" = "POST"): Promise<AdminActionOutcome> {
  const store = await cookies();
  const result = await apiRequest(path, ignoreData, { method, body, cookieHeader: sessionCookieHeader((name) => store.get(name)?.value) });
  if (!result.ok) return { kind: "error", message: result.error };
  revalidatePath("/admin", "layout");
  return { kind: "success" };
}

function ids(tenantId: string, invoiceId?: string): { tenantId: string; invoiceId: string } | null {
  const tenant = z.uuid().safeParse(tenantId);
  const invoice = z.uuid().safeParse(invoiceId ?? tenantId);
  return tenant.success && invoice.success ? { tenantId: tenant.data, invoiceId: invoice.data } : null;
}

export async function confirmPayment(tenantId: string, invoiceId: string): Promise<AdminActionOutcome> {
  const parsed = ids(tenantId, invoiceId);
  if (!parsed) return INVALID;
  return send(`/admin/tenants/${parsed.tenantId}/invoices/${parsed.invoiceId}/confirm`, {});
}

export async function rejectPayment(tenantId: string, invoiceId: string, reason: string): Promise<AdminActionOutcome> {
  const parsed = ids(tenantId, invoiceId);
  const body = rejectPaymentSchema.safeParse({ reason });
  if (!parsed) return INVALID;
  if (!body.success) return { kind: "error", message: body.error.issues[0]?.message ?? "Alasan tidak valid" };
  return send(`/admin/tenants/${parsed.tenantId}/invoices/${parsed.invoiceId}/reject`, body.data);
}

export async function addPlatformPrice(input: BillingPriceInput): Promise<AdminActionOutcome> {
  const parsed = billingPriceInputSchema.safeParse(input);
  if (!parsed.success) return { kind: "error", message: parsed.error.issues[0]?.message ?? "Input tidak valid" };
  return send("/admin/billing/prices", parsed.data);
}

export async function extendTenantTrial(tenantId: string, days: number): Promise<AdminActionOutcome> {
  const parsed = ids(tenantId);
  const body = extendTrialSchema.safeParse({ days });
  if (!parsed) return INVALID;
  if (!body.success) return { kind: "error", message: body.error.issues[0]?.message ?? "Jumlah hari tidak valid" };
  return send(`/admin/tenants/${parsed.tenantId}/subscription/trial`, body.data);
}

export async function setTenantComplimentary(tenantId: string): Promise<AdminActionOutcome> {
  const parsed = ids(tenantId);
  if (!parsed) return INVALID;
  return send(`/admin/tenants/${parsed.tenantId}/subscription/complimentary`, {});
}

export async function setTenantPrice(tenantId: string, input: TenantPriceOverrideInput): Promise<AdminActionOutcome> {
  const parsed = ids(tenantId);
  const body = tenantPriceOverrideSchema.safeParse(input);
  if (!parsed) return INVALID;
  if (!body.success) return { kind: "error", message: body.error.issues[0]?.message ?? "Input tidak valid" };
  return send(`/admin/tenants/${parsed.tenantId}/subscription/price`, body.data, "PUT");
}

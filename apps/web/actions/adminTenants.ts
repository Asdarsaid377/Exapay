"use server";

import { type CreateTenantInput, createdTenantSchema, createTenantSchema } from "@exapay/shared";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { apiRequest, sessionCookieHeader } from "@/lib/api/server";
import type { AdminActionOutcome, CreateTenantOutcome } from "@/lib/adminOutcomes";

// Server Action tipis panel super-admin: validasi ulang → API /admin/tenants → revalidate. Otorisasi di API.

const ignoreData = (): null => null;
const INVALID_TENANT: AdminActionOutcome = { kind: "error", message: "Tenant tidak valid" };

async function currentCookieHeader(): Promise<string | undefined> {
  const store = await cookies();
  return sessionCookieHeader((name) => store.get(name)?.value);
}

async function postTenantAction(tenantId: string, action: "deactivate" | "reactivate" | "resend-owner-invitation"): Promise<AdminActionOutcome> {
  const parsed = z.uuid().safeParse(tenantId);
  if (!parsed.success) return INVALID_TENANT;

  const result = await apiRequest(`/admin/tenants/${parsed.data}/${action}`, ignoreData, {
    method: "POST",
    body: {},
    cookieHeader: await currentCookieHeader(),
  });
  if (!result.ok) return { kind: "error", message: result.error };
  revalidatePath("/admin/tenants", "layout");
  return { kind: "success" };
}

export async function createTenant(input: CreateTenantInput): Promise<CreateTenantOutcome> {
  const parsed = createTenantSchema.safeParse(input);
  if (!parsed.success) return { kind: "error", message: parsed.error.issues[0]?.message ?? "Input tidak valid" };

  const result = await apiRequest("/admin/tenants", (data) => createdTenantSchema.parse(data), {
    method: "POST",
    body: parsed.data,
    cookieHeader: await currentCookieHeader(),
  });
  if (!result.ok) return { kind: "error", message: result.error };
  revalidatePath("/admin/tenants", "layout");
  return { kind: "success", tenantId: result.data.id };
}

export async function deactivateTenant(tenantId: string): Promise<AdminActionOutcome> {
  return postTenantAction(tenantId, "deactivate");
}

export async function reactivateTenant(tenantId: string): Promise<AdminActionOutcome> {
  return postTenantAction(tenantId, "reactivate");
}

export async function resendOwnerInvitation(tenantId: string): Promise<AdminActionOutcome> {
  return postTenantAction(tenantId, "resend-owner-invitation");
}

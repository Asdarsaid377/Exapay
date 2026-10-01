"use server";

import { complianceReminderKeySchema } from "@exapay/shared";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

import { apiRequest, sessionCookieHeader } from "@/lib/api/server";
import type { ComplianceActionOutcome } from "@/lib/complianceLabels";

// Server Action tipis kalender kepatuhan (feature 33): validasi kunci → API → revalidate. Peran & keberlakuan dicek di API.

async function cookieHeader(): Promise<string | undefined> {
  const store = await cookies();
  return sessionCookieHeader((name) => store.get(name)?.value);
}

async function send(action: "complete" | "reopen", key: string): Promise<ComplianceActionOutcome> {
  const parsed = complianceReminderKeySchema.safeParse(key);
  if (!parsed.success) return { kind: "error", message: "Pengingat tidak valid" };
  const result = await apiRequest(`/compliance/reminders/${action}`, () => null, {
    method: "POST",
    body: { key: parsed.data },
    cookieHeader: await cookieHeader(),
  });
  if (!result.ok) return { kind: "error", message: result.error };
  revalidatePath("/compliance");
  return { kind: "success" };
}

export async function completeComplianceReminder(key: string): Promise<ComplianceActionOutcome> {
  return send("complete", key);
}

export async function reopenComplianceReminder(key: string): Promise<ComplianceActionOutcome> {
  return send("reopen", key);
}

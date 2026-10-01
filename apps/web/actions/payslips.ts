"use server";

import { publishPayslipsResultSchema } from "@exapay/shared";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod";

import { apiRequest, sessionCookieHeader } from "@/lib/api/server";
import type { PublishPayslipsOutcome, PayslipActionOutcome } from "@/lib/payslipLabels";

// Server Action tipis slip gaji (feature 31): validasi id → API → revalidate. Peran & aturan terbit dicek di API.

const INVALID = { kind: "error", message: "Data tidak valid" } as const;
const idSchema = z.uuid();

async function cookieHeader(): Promise<string | undefined> {
  const store = await cookies();
  return sessionCookieHeader((name) => store.get(name)?.value);
}

export async function publishPayslips(runId: string): Promise<PublishPayslipsOutcome> {
  const parsed = idSchema.safeParse(runId);
  if (!parsed.success) return INVALID;
  const result = await apiRequest(`/payroll/runs/${parsed.data}/slips/publish`, (data) => publishPayslipsResultSchema.parse(data), {
    method: "POST",
    cookieHeader: await cookieHeader(),
  });
  if (!result.ok) return { kind: "error", message: result.error };
  revalidatePath(`/payroll/${parsed.data}/slips`);
  return { kind: "success", ...result.data };
}

export async function retryPayslips(runId: string): Promise<PayslipActionOutcome> {
  const parsed = idSchema.safeParse(runId);
  if (!parsed.success) return INVALID;
  const result = await apiRequest(`/payroll/runs/${parsed.data}/slips/retry`, () => null, { method: "POST", cookieHeader: await cookieHeader() });
  if (!result.ok) return { kind: "error", message: result.error };
  revalidatePath(`/payroll/${parsed.data}/slips`);
  return { kind: "success" };
}

export async function resendPayslipEmail(runId: string, payslipId: string): Promise<PayslipActionOutcome> {
  const parsedRun = idSchema.safeParse(runId);
  const parsedId = idSchema.safeParse(payslipId);
  if (!parsedRun.success || !parsedId.success) return INVALID;
  const result = await apiRequest(`/payroll/runs/${parsedRun.data}/slips/${parsedId.data}/email`, () => null, {
    method: "POST",
    cookieHeader: await cookieHeader(),
  });
  if (!result.ok) return { kind: "error", message: result.error };
  revalidatePath(`/payroll/${parsedRun.data}/slips`);
  return { kind: "success" };
}

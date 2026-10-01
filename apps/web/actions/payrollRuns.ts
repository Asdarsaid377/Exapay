"use server";

import { type OpenPayrollRunInput, openPayrollRunSchema, type PayrollAdjustmentInput, payrollAdjustmentInputSchema } from "@exapay/shared";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod";

import { apiRequest, sessionCookieHeader } from "@/lib/api/server";
import type { OpenPayrollRunOutcome, PayrollActionOutcome } from "@/lib/payrollRunOutcomes";

// Server Action tipis run payroll (feature 29): validasi ulang → API → revalidate. Peran & aturan draf dicek di API.

const INVALID = { kind: "error", message: "Data tidak valid" } as const;
const ignoreData = (): null => null;
const idSchema = z.uuid();

async function cookieHeader(): Promise<string | undefined> {
  const store = await cookies();
  return sessionCookieHeader((name) => store.get(name)?.value);
}

async function send(method: "POST" | "PUT" | "DELETE", path: string, body?: unknown): Promise<PayrollActionOutcome> {
  const result = await apiRequest(path, ignoreData, { method, body, cookieHeader: await cookieHeader() });
  if (!result.ok) return { kind: "error", message: result.error };
  // Daftar (jumlah penyesuaian), draf periode, dan rincian karyawan
  revalidatePath("/payroll", "layout");
  return { kind: "success" };
}

export async function openPayrollRun(input: OpenPayrollRunInput): Promise<OpenPayrollRunOutcome> {
  const parsed = openPayrollRunSchema.safeParse(input);
  if (!parsed.success) return { kind: "error", message: parsed.error.issues[0]?.message ?? "Input tidak valid" };
  const result = await apiRequest("/payroll/runs", (data) => z.object({ id: z.string() }).parse(data), {
    method: "POST",
    body: parsed.data,
    cookieHeader: await cookieHeader(),
  });
  if (!result.ok) return { kind: "error", message: result.error };
  revalidatePath("/payroll", "layout");
  return { kind: "success", id: result.data.id };
}

export async function addPayrollAdjustment(runId: string, employeeId: string, input: PayrollAdjustmentInput): Promise<PayrollActionOutcome> {
  const parsedRun = idSchema.safeParse(runId);
  const parsedEmployee = idSchema.safeParse(employeeId);
  const parsed = payrollAdjustmentInputSchema.safeParse(input);
  if (!parsedRun.success || !parsedEmployee.success) return INVALID;
  if (!parsed.success) return { kind: "error", message: parsed.error.issues[0]?.message ?? "Input tidak valid" };
  return send("POST", `/payroll/runs/${parsedRun.data}/employees/${parsedEmployee.data}/adjustments`, parsed.data);
}

export async function updatePayrollAdjustment(runId: string, adjustmentId: string, input: PayrollAdjustmentInput): Promise<PayrollActionOutcome> {
  const parsedRun = idSchema.safeParse(runId);
  const parsedId = idSchema.safeParse(adjustmentId);
  const parsed = payrollAdjustmentInputSchema.safeParse(input);
  if (!parsedRun.success || !parsedId.success) return INVALID;
  if (!parsed.success) return { kind: "error", message: parsed.error.issues[0]?.message ?? "Input tidak valid" };
  return send("PUT", `/payroll/runs/${parsedRun.data}/adjustments/${parsedId.data}`, parsed.data);
}

export async function deletePayrollAdjustment(runId: string, adjustmentId: string): Promise<PayrollActionOutcome> {
  const parsedRun = idSchema.safeParse(runId);
  const parsedId = idSchema.safeParse(adjustmentId);
  if (!parsedRun.success || !parsedId.success) return INVALID;
  return send("DELETE", `/payroll/runs/${parsedRun.data}/adjustments/${parsedId.data}`);
}

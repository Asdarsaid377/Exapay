"use server";

import { type TaskBulkApproveInput, taskBulkApproveResultSchema, taskBulkApproveSchema, type TaskDecisionInput, taskDecisionSchema } from "@exapay/shared";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod";

import { apiRequest, sessionCookieHeader } from "@/lib/api/server";
import type { BulkApproveOutcome, TaskDecisionOutcome } from "@/lib/taskVerificationOutcomes";

// Server Action tipis verifikasi tugas: validasi ulang → API → revalidate. Hak akses & cakupan dicek di API.

async function send<T>(path: string, parse: (data: unknown) => T, body: unknown) {
  const store = await cookies();
  return apiRequest(path, parse, { method: "POST", body, cookieHeader: sessionCookieHeader((name) => store.get(name)?.value) });
}

export async function decideTaskLog(id: string, input: TaskDecisionInput): Promise<TaskDecisionOutcome> {
  const parsedId = z.uuid().safeParse(id);
  const parsed = taskDecisionSchema.safeParse(input);
  if (!parsedId.success) return { kind: "error", message: "Data tidak valid" };
  if (!parsed.success) return { kind: "error", message: parsed.error.issues[0]?.message ?? "Input tidak valid" };
  const result = await send(`/tasks/verification/${parsedId.data}/decision`, () => null, parsed.data);
  if (!result.ok) return { kind: "error", message: result.error };
  revalidatePath("/kpi/verification");
  return { kind: "success" };
}

export async function approveTaskLogs(input: TaskBulkApproveInput): Promise<BulkApproveOutcome> {
  const parsed = taskBulkApproveSchema.safeParse(input);
  if (!parsed.success) return { kind: "error", message: parsed.error.issues[0]?.message ?? "Input tidak valid" };
  const result = await send("/tasks/verification/approve", (data) => taskBulkApproveResultSchema.parse(data), parsed.data);
  if (!result.ok) return { kind: "error", message: result.error };
  revalidatePath("/kpi/verification");
  return { kind: "success", ...result.data };
}

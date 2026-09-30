"use server";

import {
  type AttendanceDeductionPreviewInput,
  attendanceDeductionPreviewInputSchema,
  attendanceDeductionPreviewSchema,
  attendanceDeductionSettingsSchema,
  type SaveAttendanceDeductionRulesInput,
  saveAttendanceDeductionRulesSchema,
} from "@exapay/shared";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

import { apiRequest, sessionCookieHeader } from "@/lib/api/server";
import type { DeductionPreviewOutcome, SaveDeductionRulesOutcome } from "@/lib/attendanceDeductionOutcomes";

// Server Action tipis aturan potongan absensi (feature 17): validasi ulang → API → revalidate. Peran dicek di API.

async function cookieHeader(): Promise<string | undefined> {
  const store = await cookies();
  return sessionCookieHeader((name) => store.get(name)?.value);
}

export async function saveAttendanceDeductionRules(input: SaveAttendanceDeductionRulesInput): Promise<SaveDeductionRulesOutcome> {
  const parsed = saveAttendanceDeductionRulesSchema.safeParse(input);
  if (!parsed.success) return { kind: "error", message: parsed.error.issues[0]?.message ?? "Input tidak valid" };
  const result = await apiRequest("/attendance/deduction-rules", (data) => attendanceDeductionSettingsSchema.parse(data), {
    method: "POST",
    body: parsed.data,
    cookieHeader: await cookieHeader(),
  });
  if (!result.ok) return { kind: "error", message: result.error };
  revalidatePath("/settings/attendance");
  return { kind: "success", settings: result.data };
}

// Tidak menyimpan apa pun — tanpa revalidate
export async function previewAttendanceDeduction(input: AttendanceDeductionPreviewInput): Promise<DeductionPreviewOutcome> {
  const parsed = attendanceDeductionPreviewInputSchema.safeParse(input);
  if (!parsed.success) return { kind: "error", message: parsed.error.issues[0]?.message ?? "Input tidak valid" };
  const result = await apiRequest("/attendance/deduction-rules/preview", (data) => attendanceDeductionPreviewSchema.parse(data), {
    method: "POST",
    body: parsed.data,
    cookieHeader: await cookieHeader(),
  });
  if (!result.ok) return { kind: "error", message: result.error };
  return { kind: "success", preview: result.data };
}

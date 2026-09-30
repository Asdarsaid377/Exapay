"use server";

import { LEAVE_ATTACHMENT_MAX_BYTES, type LeaveDecisionInput, leaveDecisionSchema, leaveRequestInputSchema, leaveRequestSchema } from "@exapay/shared";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod";

import { apiRequest, sessionCookieHeader } from "@/lib/api/server";
import type { LeaveActionOutcome } from "@/lib/leaveRequestOutcomes";

// Server Action tipis pengajuan izin/sakit/cuti: validasi ulang → API → revalidate. Hak akses & cakupan dicek di API.

const INVALID = { kind: "error", message: "Data tidak valid" } as const;
const ignoreData = (): null => null;
const ATTACHMENT_EXTENSIONS = [".pdf", ".jpg", ".jpeg", ".png"];

async function send<T>(path: string, parse: (data: unknown) => T, body: unknown) {
  const store = await cookies();
  return apiRequest(path, parse, { method: "POST", body, cookieHeader: sessionCookieHeader((name) => store.get(name)?.value) });
}

// FormData: type, startDate, endDate, reason, attachment (opsional). Jenis file sebenarnya diperiksa API dari isi file.
export async function submitLeaveRequest(formData: FormData): Promise<LeaveActionOutcome> {
  const parsed = leaveRequestInputSchema.safeParse({
    type: formData.get("type"),
    startDate: formData.get("startDate"),
    endDate: formData.get("endDate"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) return { kind: "error", message: parsed.error.issues[0]?.message ?? "Input tidak valid" };

  const body = new FormData();
  body.set("type", parsed.data.type);
  body.set("startDate", parsed.data.startDate);
  body.set("endDate", parsed.data.endDate);
  body.set("reason", parsed.data.reason);
  const file = formData.get("attachment");
  if (file instanceof File && file.size > 0) {
    if (!ATTACHMENT_EXTENSIONS.some((ext) => file.name.toLowerCase().endsWith(ext))) return { kind: "error", message: "Lampiran harus berupa PDF, JPG, atau PNG" };
    if (file.size > LEAVE_ATTACHMENT_MAX_BYTES) return { kind: "error", message: "Lampiran terlalu besar (maks. 5 MB)" };
    body.set("attachment", file, file.name);
  }

  const result = await send("/attendance/me/leave-requests", (data) => leaveRequestSchema.parse(data), body);
  if (!result.ok) return { kind: "error", message: result.error };
  revalidatePath("/me/attendance");
  return { kind: "success" };
}

export async function cancelLeaveRequest(id: string): Promise<LeaveActionOutcome> {
  const parsedId = z.uuid().safeParse(id);
  if (!parsedId.success) return INVALID;
  const result = await send(`/attendance/me/leave-requests/${parsedId.data}/cancel`, ignoreData, {});
  if (!result.ok) return { kind: "error", message: result.error };
  revalidatePath("/me/attendance");
  return { kind: "success" };
}

export async function decideLeaveRequest(id: string, input: LeaveDecisionInput): Promise<LeaveActionOutcome> {
  const parsedId = z.uuid().safeParse(id);
  const parsed = leaveDecisionSchema.safeParse(input);
  if (!parsedId.success) return INVALID;
  if (!parsed.success) return { kind: "error", message: parsed.error.issues[0]?.message ?? "Input tidak valid" };
  const result = await send(`/attendance/leave-requests/${parsedId.data}/decision`, ignoreData, parsed.data);
  if (!result.ok) return { kind: "error", message: result.error };
  revalidatePath("/attendance/requests");
  return { kind: "success" };
}

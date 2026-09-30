"use server";

import { type AcceptInvitationInput, acceptInvitationSchema } from "@exapay/shared";

import { apiRequest } from "@/lib/api/server";
import type { SimpleOutcome } from "@/lib/auth/outcomes";

// Terima undangan (tanpa login). Sesi tidak dibuat — penerima masuk lewat /login.
export async function acceptInvitation(input: AcceptInvitationInput): Promise<SimpleOutcome> {
  const parsed = acceptInvitationSchema.safeParse(input);
  if (!parsed.success) return { kind: "error", message: parsed.error.issues[0]?.message ?? "Input tidak valid" };

  const result = await apiRequest("/invitations/accept", () => null, { method: "POST", body: parsed.data });
  if (result.ok) return { kind: "success" };
  // 410: tautan tidak valid / sudah dipakai / kedaluwarsa
  return result.status === 410 ? { kind: "invalid-token" } : { kind: "error", message: result.error };
}

"use server";

import { changeMemberRoleSchema, type InviteUserInput, inviteUserSchema, type MembershipRole } from "@exapay/shared";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { apiRequest, sessionCookieHeader } from "@/lib/api/server";
import type { UserActionOutcome } from "@/lib/userOutcomes";

// Server Action tipis /settings/users: validasi ulang → API /users → revalidate. Wewenang per peran dicek di API.

const ignoreData = (): null => null;

async function post(path: string, body: unknown): Promise<UserActionOutcome> {
  const store = await cookies();
  const result = await apiRequest(path, ignoreData, {
    method: "POST",
    body,
    cookieHeader: sessionCookieHeader((name) => store.get(name)?.value),
  });
  if (!result.ok) return { kind: "error", message: result.error };
  revalidatePath("/settings/users");
  return { kind: "success" };
}

function validId(id: string): string | null {
  const parsed = z.uuid().safeParse(id);
  return parsed.success ? parsed.data : null;
}

export async function inviteUser(input: InviteUserInput): Promise<UserActionOutcome> {
  const parsed = inviteUserSchema.safeParse(input);
  if (!parsed.success) return { kind: "error", message: parsed.error.issues[0]?.message ?? "Input tidak valid" };
  return post("/users/invitations", parsed.data);
}

export async function resendInvitation(invitationId: string): Promise<UserActionOutcome> {
  const id = validId(invitationId);
  if (!id) return { kind: "error", message: "Undangan tidak valid" };
  return post(`/users/invitations/${id}/resend`, {});
}

export async function cancelInvitation(invitationId: string): Promise<UserActionOutcome> {
  const id = validId(invitationId);
  if (!id) return { kind: "error", message: "Undangan tidak valid" };
  return post(`/users/invitations/${id}/cancel`, {});
}

export async function changeMemberRole(membershipId: string, role: MembershipRole): Promise<UserActionOutcome> {
  const id = validId(membershipId);
  const parsed = changeMemberRoleSchema.safeParse({ role });
  if (!id || !parsed.success) return { kind: "error", message: "Pengguna atau peran tidak valid" };
  return post(`/users/${id}/role`, parsed.data);
}

export async function revokeMember(membershipId: string): Promise<UserActionOutcome> {
  const id = validId(membershipId);
  if (!id) return { kind: "error", message: "Pengguna tidak valid" };
  return post(`/users/${id}/revoke`, {});
}

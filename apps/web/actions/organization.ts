"use server";

import { ORG_KINDS, type OrgKind, orgItemSchema } from "@exapay/shared";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { apiRequest, sessionCookieHeader } from "@/lib/api/server";
import type { OrgActionOutcome } from "@/lib/organizationOutcomes";

// Server Action tipis /organization: validasi ulang → API /organization → revalidate. Peran dicek di API.

const ignoreData = (): null => null;
const kindSchema = z.enum(ORG_KINDS);

async function send(method: "POST" | "PUT" | "DELETE", path: string, body?: unknown): Promise<OrgActionOutcome> {
  const store = await cookies();
  const result = await apiRequest(path, ignoreData, { method, body, cookieHeader: sessionCookieHeader((name) => store.get(name)?.value) });
  if (!result.ok) return { kind: "error", message: result.error };
  revalidatePath("/organization");
  return { kind: "success" };
}

export async function createOrgItem(kind: OrgKind, name: string): Promise<OrgActionOutcome> {
  const parsedKind = kindSchema.safeParse(kind);
  const parsed = orgItemSchema.safeParse({ name });
  if (!parsedKind.success) return { kind: "error", message: "Data tidak valid" };
  if (!parsed.success) return { kind: "error", message: parsed.error.issues[0]?.message ?? "Input tidak valid" };
  return send("POST", `/organization/${parsedKind.data}`, parsed.data);
}

export async function renameOrgItem(kind: OrgKind, id: string, name: string): Promise<OrgActionOutcome> {
  const parsedKind = kindSchema.safeParse(kind);
  const parsedId = z.uuid().safeParse(id);
  const parsed = orgItemSchema.safeParse({ name });
  if (!parsedKind.success || !parsedId.success) return { kind: "error", message: "Data tidak valid" };
  if (!parsed.success) return { kind: "error", message: parsed.error.issues[0]?.message ?? "Input tidak valid" };
  return send("PUT", `/organization/${parsedKind.data}/${parsedId.data}`, parsed.data);
}

export async function deleteOrgItem(kind: OrgKind, id: string): Promise<OrgActionOutcome> {
  const parsedKind = kindSchema.safeParse(kind);
  const parsedId = z.uuid().safeParse(id);
  if (!parsedKind.success || !parsedId.success) return { kind: "error", message: "Data tidak valid" };
  return send("DELETE", `/organization/${parsedKind.data}/${parsedId.data}`);
}

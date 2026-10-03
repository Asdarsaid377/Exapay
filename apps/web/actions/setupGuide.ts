"use server";

import { setupGuideSchema } from "@exapay/shared";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

import { apiRequest, sessionCookieHeader } from "@/lib/api/server";

// Server Action panduan setup (feature 48): lewati / buka lagi, jadwal sudah dicek, tutup. Peran dicek di API.

export type SetupGuideOutcome = { kind: "success" } | { kind: "error"; message: string };

async function send(path: string, method: "PUT" | "POST", body?: object): Promise<SetupGuideOutcome> {
  const store = await cookies();
  const cookieHeader = sessionCookieHeader((name) => store.get(name)?.value);
  const result = await apiRequest(path, (data) => setupGuideSchema.parse(data), { method, body: body ?? {}, cookieHeader });
  if (!result.ok) return { kind: "error", message: result.error };
  // Layout ikut dirender ulang: item "Panduan setup" di menu akun
  revalidatePath("/", "layout");
  return { kind: "success" };
}

export async function setSetupGuideHidden(hidden: boolean): Promise<SetupGuideOutcome> {
  if (typeof hidden !== "boolean") return { kind: "error", message: "Data tidak valid" };
  return send("/setup-guide/visibility", "PUT", { hidden });
}

export async function markScheduleChecked(): Promise<SetupGuideOutcome> {
  return send("/setup-guide/schedule-checked", "POST");
}

export async function closeSetupGuide(): Promise<SetupGuideOutcome> {
  return send("/setup-guide/close", "POST");
}

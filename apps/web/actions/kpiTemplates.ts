"use server";

import { type KpiTemplateInput, kpiTemplateInputSchema } from "@exapay/shared";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { apiRequest, sessionCookieHeader } from "@/lib/api/server";
import type { AddBuiltinKpiTemplatesOutcome, KpiTemplateActionOutcome } from "@/lib/kpiTemplateOutcomes";

// Server Action tipis /kpi/templates: validasi ulang → API /kpi/templates → revalidate. Peran dicek di API.

const INVALID = { kind: "error", message: "Data tidak valid" } as const;
const ignoreData = (): null => null;
const addedSchema = z.object({ added: z.number() });

async function send<T>(method: "POST" | "PUT" | "DELETE", path: string, parse: (data: unknown) => T, body?: unknown) {
  const store = await cookies();
  const result = await apiRequest(path, parse, { method, body, cookieHeader: sessionCookieHeader((name) => store.get(name)?.value) });
  if (result.ok) revalidatePath("/kpi/templates", "layout");
  return result;
}

export async function createKpiTemplate(input: KpiTemplateInput): Promise<KpiTemplateActionOutcome> {
  const parsed = kpiTemplateInputSchema.safeParse(input);
  if (!parsed.success) return { kind: "error", message: parsed.error.issues[0]?.message ?? "Input tidak valid" };
  const result = await send("POST", "/kpi/templates", ignoreData, parsed.data);
  return result.ok ? { kind: "success" } : { kind: "error", message: result.error };
}

export async function updateKpiTemplate(id: string, input: KpiTemplateInput): Promise<KpiTemplateActionOutcome> {
  const parsedId = z.uuid().safeParse(id);
  const parsed = kpiTemplateInputSchema.safeParse(input);
  if (!parsedId.success) return INVALID;
  if (!parsed.success) return { kind: "error", message: parsed.error.issues[0]?.message ?? "Input tidak valid" };
  const result = await send("PUT", `/kpi/templates/${parsedId.data}`, ignoreData, parsed.data);
  return result.ok ? { kind: "success" } : { kind: "error", message: result.error };
}

export async function deleteKpiTemplate(id: string): Promise<KpiTemplateActionOutcome> {
  const parsedId = z.uuid().safeParse(id);
  if (!parsedId.success) return INVALID;
  const result = await send("DELETE", `/kpi/templates/${parsedId.data}`, ignoreData);
  return result.ok ? { kind: "success" } : { kind: "error", message: result.error };
}

export async function addBuiltinKpiTemplates(): Promise<AddBuiltinKpiTemplatesOutcome> {
  const result = await send("POST", "/kpi/templates/builtin", (data) => addedSchema.parse(data));
  return result.ok ? { kind: "success", added: result.data.added } : { kind: "error", message: result.error };
}

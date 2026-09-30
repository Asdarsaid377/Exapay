"use server";

import {
  type CreateKpiReviewsInput,
  createKpiReviewsResultSchema,
  createKpiReviewsSchema,
  type KpiReviewRatingsInput,
  kpiReviewRatingsSchema,
  type KpiReviewStatusInput,
  kpiReviewStatusSchema,
  type KpiSettingsInput,
  kpiSettingsInputSchema,
  kpiSettingsSchema,
} from "@exapay/shared";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod";

import { apiRequest, sessionCookieHeader } from "@/lib/api/server";
import type { CreateKpiReviewsOutcome, KpiReviewActionOutcome, KpiSettingsOutcome } from "@/lib/kpiReviewOutcomes";

// Server Action tipis siklus & penilaian KPI: validasi ulang → API → revalidate. Peran & cakupan dicek di API.

const INVALID = { kind: "error", message: "Data tidak valid" } as const;
const ignoreData = (): null => null;

async function send<T>(method: "POST" | "PUT", path: string, parse: (data: unknown) => T, body: unknown) {
  const store = await cookies();
  return apiRequest(path, parse, { method, body, cookieHeader: sessionCookieHeader((name) => store.get(name)?.value) });
}

export async function saveKpiSettings(input: KpiSettingsInput): Promise<KpiSettingsOutcome> {
  const parsed = kpiSettingsInputSchema.safeParse(input);
  if (!parsed.success) return { kind: "error", message: parsed.error.issues[0]?.message ?? "Input tidak valid" };
  const result = await send("PUT", "/kpi/settings", (data) => kpiSettingsSchema.parse(data), parsed.data);
  if (!result.ok) return { kind: "error", message: result.error };
  revalidatePath("/settings/kpi");
  revalidatePath("/kpi/reviews");
  return { kind: "success", settings: result.data };
}

export async function createKpiReviews(input: CreateKpiReviewsInput): Promise<CreateKpiReviewsOutcome> {
  const parsed = createKpiReviewsSchema.safeParse(input);
  if (!parsed.success) return { kind: "error", message: parsed.error.issues[0]?.message ?? "Input tidak valid" };
  const result = await send("POST", "/kpi/reviews", (data) => createKpiReviewsResultSchema.parse(data), parsed.data);
  if (!result.ok) return { kind: "error", message: result.error };
  revalidatePath("/kpi/reviews", "layout");
  return { kind: "success", ...result.data };
}

export async function saveKpiReviewRatings(id: string, input: KpiReviewRatingsInput): Promise<KpiReviewActionOutcome> {
  const parsedId = z.uuid().safeParse(id);
  const parsed = kpiReviewRatingsSchema.safeParse(input);
  if (!parsedId.success) return INVALID;
  if (!parsed.success) return { kind: "error", message: parsed.error.issues[0]?.message ?? "Input tidak valid" };
  const result = await send("PUT", `/kpi/reviews/${parsedId.data}/ratings`, ignoreData, parsed.data);
  if (!result.ok) return { kind: "error", message: result.error };
  revalidatePath("/kpi/reviews", "layout");
  return { kind: "success" };
}

export async function changeKpiReviewStatus(id: string, input: KpiReviewStatusInput): Promise<KpiReviewActionOutcome> {
  const parsedId = z.uuid().safeParse(id);
  const parsed = kpiReviewStatusSchema.safeParse(input);
  if (!parsedId.success || !parsed.success) return INVALID;
  const result = await send("POST", `/kpi/reviews/${parsedId.data}/status`, ignoreData, parsed.data);
  if (!result.ok) return { kind: "error", message: result.error };
  revalidatePath("/kpi/reviews", "layout");
  return { kind: "success" };
}

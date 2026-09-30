"use server";

import {
  type CompanyHolidayInput,
  companyHolidayInputSchema,
  isValidIsoDate,
  type WorkScheduleInput,
  workScheduleInputSchema,
  workScheduleSchema,
} from "@exapay/shared";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { apiRequest, sessionCookieHeader } from "@/lib/api/server";
import type { SaveWorkScheduleOutcome, WorkCalendarActionOutcome } from "@/lib/workCalendarOutcomes";

// Server Action tipis /settings/attendance: validasi ulang → API /attendance → revalidate. Peran dicek di API.

const PAGE = "/settings/attendance";
const ignoreData = (): null => null;

async function cookieHeader(): Promise<string | undefined> {
  const store = await cookies();
  return sessionCookieHeader((name) => store.get(name)?.value);
}

async function send(method: "POST" | "PUT" | "DELETE", path: string, body?: unknown): Promise<WorkCalendarActionOutcome> {
  const result = await apiRequest(path, ignoreData, { method, body, cookieHeader: await cookieHeader() });
  if (!result.ok) return { kind: "error", message: result.error };
  revalidatePath(PAGE);
  return { kind: "success" };
}

export async function saveWorkSchedule(input: WorkScheduleInput): Promise<SaveWorkScheduleOutcome> {
  const parsed = workScheduleInputSchema.safeParse(input);
  if (!parsed.success) return { kind: "error", message: parsed.error.issues[0]?.message ?? "Input tidak valid" };
  const result = await apiRequest("/attendance/schedule", (data) => workScheduleSchema.parse(data), {
    method: "PUT",
    body: parsed.data,
    cookieHeader: await cookieHeader(),
  });
  if (!result.ok) return { kind: "error", message: result.error };
  revalidatePath(PAGE);
  return { kind: "success", schedule: result.data };
}

export async function setNationalHolidayObservance(date: string, observed: boolean): Promise<WorkCalendarActionOutcome> {
  if (!isValidIsoDate(date) || typeof observed !== "boolean") return { kind: "error", message: "Data tidak valid" };
  return send("PUT", `/attendance/national-holidays/${date}`, { observed });
}

export async function createCompanyHoliday(input: CompanyHolidayInput): Promise<WorkCalendarActionOutcome> {
  const parsed = companyHolidayInputSchema.safeParse(input);
  if (!parsed.success) return { kind: "error", message: parsed.error.issues[0]?.message ?? "Input tidak valid" };
  return send("POST", "/attendance/company-holidays", parsed.data);
}

export async function updateCompanyHoliday(id: string, input: CompanyHolidayInput): Promise<WorkCalendarActionOutcome> {
  const parsedId = z.uuid().safeParse(id);
  const parsed = companyHolidayInputSchema.safeParse(input);
  if (!parsedId.success) return { kind: "error", message: "Data tidak valid" };
  if (!parsed.success) return { kind: "error", message: parsed.error.issues[0]?.message ?? "Input tidak valid" };
  return send("PUT", `/attendance/company-holidays/${parsedId.data}`, parsed.data);
}

export async function deleteCompanyHoliday(id: string): Promise<WorkCalendarActionOutcome> {
  const parsedId = z.uuid().safeParse(id);
  if (!parsedId.success) return { kind: "error", message: "Data tidak valid" };
  return send("DELETE", `/attendance/company-holidays/${parsedId.data}`);
}

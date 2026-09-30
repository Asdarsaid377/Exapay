"use server";

import {
  deactivateEmployeeSchema,
  type DeactivateEmployeeFormInput,
  type EmployeeFormInput,
  employeeInputSchema,
  revealedSensitiveSchema,
  revealSensitiveSchema,
  type SensitiveSection,
} from "@exapay/shared";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod";

import { apiRequest, sessionCookieHeader } from "@/lib/api/server";
import type { CreateEmployeeOutcome, EmployeeActionOutcome, RevealOutcome } from "@/lib/employeeOutcomes";

// Server Action tipis /employees: validasi ulang → API /employees → revalidate. Peran & cakupan dicek di API.

const INVALID = { kind: "error", message: "Data tidak valid" } as const;
const ignoreData = (): null => null;
const createdSchema = z.object({ id: z.string() });

async function send<T>(method: "POST" | "PUT", path: string, parse: (data: unknown) => T, body?: unknown) {
  const store = await cookies();
  return apiRequest(path, parse, { method, body, cookieHeader: sessionCookieHeader((name) => store.get(name)?.value) });
}

export async function createEmployee(input: EmployeeFormInput): Promise<CreateEmployeeOutcome> {
  const parsed = employeeInputSchema.safeParse(input);
  if (!parsed.success) return { kind: "error", message: parsed.error.issues[0]?.message ?? "Input tidak valid" };
  const result = await send("POST", "/employees", (data) => createdSchema.parse(data), parsed.data);
  if (!result.ok) return { kind: "error", message: result.error };
  revalidatePath("/employees");
  return { kind: "success", id: result.data.id };
}

export async function updateEmployee(id: string, input: EmployeeFormInput): Promise<EmployeeActionOutcome> {
  const parsedId = z.uuid().safeParse(id);
  const parsed = employeeInputSchema.safeParse(input);
  if (!parsedId.success) return INVALID;
  if (!parsed.success) return { kind: "error", message: parsed.error.issues[0]?.message ?? "Input tidak valid" };
  const result = await send("PUT", `/employees/${parsedId.data}`, ignoreData, parsed.data);
  if (!result.ok) return { kind: "error", message: result.error };
  revalidatePath("/employees", "layout");
  return { kind: "success" };
}

export async function deactivateEmployee(id: string, input: DeactivateEmployeeFormInput): Promise<EmployeeActionOutcome> {
  const parsedId = z.uuid().safeParse(id);
  const parsed = deactivateEmployeeSchema.safeParse(input);
  if (!parsedId.success) return INVALID;
  if (!parsed.success) return { kind: "error", message: parsed.error.issues[0]?.message ?? "Input tidak valid" };
  const result = await send("POST", `/employees/${parsedId.data}/deactivate`, ignoreData, parsed.data);
  if (!result.ok) return { kind: "error", message: result.error };
  revalidatePath("/employees", "layout");
  return { kind: "success" };
}

export async function reactivateEmployee(id: string): Promise<EmployeeActionOutcome> {
  const parsedId = z.uuid().safeParse(id);
  if (!parsedId.success) return INVALID;
  const result = await send("POST", `/employees/${parsedId.data}/reactivate`, ignoreData);
  if (!result.ok) return { kind: "error", message: result.error };
  revalidatePath("/employees", "layout");
  return { kind: "success" };
}

// Nilai penuh hanya dikembalikan ke component yang meminta — tidak di-cache, tidak di-revalidate
export async function revealSensitive(id: string, section: SensitiveSection): Promise<RevealOutcome> {
  const parsedId = z.uuid().safeParse(id);
  const parsed = revealSensitiveSchema.safeParse({ section });
  if (!parsedId.success || !parsed.success) return INVALID;
  const result = await send("POST", `/employees/${parsedId.data}/reveal`, (data) => revealedSensitiveSchema.parse(data), parsed.data);
  if (!result.ok) return { kind: "error", message: result.error };
  return { kind: "success", revealed: result.data };
}

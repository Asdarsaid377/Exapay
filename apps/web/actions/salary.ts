"use server";

import {
  employeeSalaryOverviewSchema,
  jkkRiskLevelInputSchema,
  type JkkRiskLevelInput,
  salaryComponentInputSchema,
  type SalaryComponentInput,
  type SaveEmployeeSalaryInput,
  saveEmployeeSalarySchema,
} from "@exapay/shared";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod";

import { apiRequest, sessionCookieHeader } from "@/lib/api/server";
import type { SalaryActionOutcome, SaveEmployeeSalaryOutcome } from "@/lib/salaryOutcomes";

// Server Action tipis komponen gaji & gaji karyawan (feature 28): validasi ulang → API → revalidate. Peran dicek di API.

const SETTINGS_PATH = "/settings/salary-components";
const ignoreData = (): null => null;
const idSchema = z.uuid();

async function cookieHeader(): Promise<string | undefined> {
  const store = await cookies();
  return sessionCookieHeader((name) => store.get(name)?.value);
}

async function send(method: "POST" | "PUT" | "DELETE", path: string, body?: unknown): Promise<SalaryActionOutcome> {
  const result = await apiRequest(path, ignoreData, { method, body, cookieHeader: await cookieHeader() });
  if (!result.ok) return { kind: "error", message: result.error };
  revalidatePath(SETTINGS_PATH);
  return { kind: "success" };
}

export async function createSalaryComponent(input: SalaryComponentInput): Promise<SalaryActionOutcome> {
  const parsed = salaryComponentInputSchema.safeParse(input);
  if (!parsed.success) return { kind: "error", message: parsed.error.issues[0]?.message ?? "Input tidak valid" };
  return send("POST", "/salary-components", parsed.data);
}

export async function updateSalaryComponent(id: string, input: SalaryComponentInput): Promise<SalaryActionOutcome> {
  const parsedId = idSchema.safeParse(id);
  const parsed = salaryComponentInputSchema.safeParse(input);
  if (!parsedId.success) return { kind: "error", message: "Data tidak valid" };
  if (!parsed.success) return { kind: "error", message: parsed.error.issues[0]?.message ?? "Input tidak valid" };
  return send("PUT", `/salary-components/${parsedId.data}`, parsed.data);
}

export async function changeSalaryComponentStatus(id: string, action: "archive" | "restore" | "delete"): Promise<SalaryActionOutcome> {
  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) return { kind: "error", message: "Data tidak valid" };
  if (action === "delete") return send("DELETE", `/salary-components/${parsedId.data}`);
  return send("POST", `/salary-components/${parsedId.data}/${action === "archive" ? "archive" : "restore"}`);
}

export async function saveJkkRiskLevel(input: JkkRiskLevelInput): Promise<SalaryActionOutcome> {
  const parsed = jkkRiskLevelInputSchema.safeParse(input);
  if (!parsed.success) return { kind: "error", message: parsed.error.issues[0]?.message ?? "Input tidak valid" };
  return send("PUT", "/salary-components/jkk-risk-level", parsed.data);
}

export async function saveEmployeeSalary(employeeId: string, input: SaveEmployeeSalaryInput): Promise<SaveEmployeeSalaryOutcome> {
  const parsedId = idSchema.safeParse(employeeId);
  const parsed = saveEmployeeSalarySchema.safeParse(input);
  if (!parsedId.success) return { kind: "error", message: "Data tidak valid" };
  if (!parsed.success) return { kind: "error", message: parsed.error.issues[0]?.message ?? "Input tidak valid" };
  const result = await apiRequest(`/employees/${parsedId.data}/salary`, (data) => employeeSalaryOverviewSchema.parse(data), {
    method: "POST",
    body: parsed.data,
    cookieHeader: await cookieHeader(),
  });
  if (!result.ok) return { kind: "error", message: result.error };
  revalidatePath(`/employees/${parsedId.data}`);
  // Jumlah karyawan per komponen ikut berubah
  revalidatePath(SETTINGS_PATH);
  return { kind: "success", overview: result.data };
}

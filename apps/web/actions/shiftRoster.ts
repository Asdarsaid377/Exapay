"use server";

import {
  isoDateSchema,
  type RosterCellInput,
  rosterCellInputSchema,
  rosterCellSchema,
  type RosterCopyInput,
  rosterCopyInputSchema,
  rosterCopyResultSchema,
  type WorkShiftInput,
  workShiftInputSchema,
  workShiftSchema,
} from "@exapay/shared";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod";

import { apiRequest, sessionCookieHeader } from "@/lib/api/server";
import type { RosterCellOutcome, RosterCopyOutcome, ShiftActionOutcome } from "@/lib/shiftRosterOutcomes";

// Server Action tipis master shift & roster (feature 46): validasi ulang → API → revalidate. Hak akses, cakupan atasan,
// dan sel terkunci dicek di API.

const INVALID = { kind: "error", message: "Data tidak valid" } as const;
const ignoreData = (): null => null;

async function cookieHeader(): Promise<string | undefined> {
  const store = await cookies();
  return sessionCookieHeader((name) => store.get(name)?.value);
}

function revalidateShifts(): void {
  revalidatePath("/settings/attendance");
  revalidatePath("/attendance/roster");
  // Menu Roster muncul/hilang mengikuti ada tidaknya shift
  revalidatePath("/", "layout");
}

// id null = shift baru
export async function saveWorkShift(id: string | null, input: WorkShiftInput): Promise<ShiftActionOutcome> {
  if (id !== null && !z.uuid().safeParse(id).success) return INVALID;
  const parsed = workShiftInputSchema.safeParse(input);
  if (!parsed.success) return { kind: "error", message: parsed.error.issues[0]?.message ?? "Input tidak valid" };
  const result = await apiRequest(id ? `/attendance/shifts/${id}` : "/attendance/shifts", (data) => workShiftSchema.parse(data), {
    method: id ? "PUT" : "POST",
    body: parsed.data,
    cookieHeader: await cookieHeader(),
  });
  if (!result.ok) return { kind: "error", message: result.error, field: result.status === 409 ? "name" : undefined };
  revalidateShifts();
  return { kind: "success" };
}

export async function deleteWorkShift(id: string): Promise<ShiftActionOutcome> {
  if (!z.uuid().safeParse(id).success) return INVALID;
  const result = await apiRequest(`/attendance/shifts/${id}`, ignoreData, { method: "DELETE", cookieHeader: await cookieHeader() });
  if (!result.ok) return { kind: "error", message: result.error };
  revalidateShifts();
  return { kind: "success" };
}

export async function setRosterCell(employeeId: string, date: string, input: RosterCellInput): Promise<RosterCellOutcome> {
  if (!z.uuid().safeParse(employeeId).success || !isoDateSchema.safeParse(date).success) return INVALID;
  const parsed = rosterCellInputSchema.safeParse(input);
  if (!parsed.success) return INVALID;
  const result = await apiRequest(`/attendance/roster/${employeeId}/${date}`, (data) => rosterCellSchema.parse(data), {
    method: "PUT",
    body: parsed.data,
    cookieHeader: await cookieHeader(),
  });
  if (!result.ok) return { kind: "error", message: result.error };
  revalidatePath("/attendance/roster");
  return { kind: "success", cell: result.data };
}

export async function copyRosterWeek(input: RosterCopyInput): Promise<RosterCopyOutcome> {
  const parsed = rosterCopyInputSchema.safeParse(input);
  if (!parsed.success) return INVALID;
  const result = await apiRequest("/attendance/roster/copy-previous-week", (data) => rosterCopyResultSchema.parse(data), {
    method: "POST",
    body: parsed.data,
    cookieHeader: await cookieHeader(),
  });
  if (!result.ok) return { kind: "error", message: result.error };
  if (!parsed.data.dryRun) revalidatePath("/attendance/roster");
  return { kind: "success", result: result.data };
}

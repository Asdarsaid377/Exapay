"use server";

import {
  ATTENDANCE_EVENTS,
  type AttendanceEvent,
  type AttendanceReviewDecisionInput,
  attendanceReviewDecisionSchema,
  type EmployeeAttendanceSettingsInput,
  employeeAttendanceSettingsInputSchema,
  employeeAttendanceSettingsSchema,
  type WorkLocationInput,
  workLocationInputSchema,
  workLocationSchema,
} from "@exapay/shared";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod";

import { apiRequest, sessionCookieHeader } from "@/lib/api/server";
import type { AttendanceSettingsOutcome, WorkLocationActionOutcome } from "@/lib/workLocationOutcomes";

// Server Action tipis lokasi kerja, pengaturan absen karyawan, dan keputusan tinjauan (feature 44):
// validasi ulang → API → revalidate. Hak akses & cakupan dicek di API.

const INVALID = { kind: "error", message: "Data tidak valid" } as const;
const ignoreData = (): null => null;

async function cookieHeader(): Promise<string | undefined> {
  const store = await cookies();
  return sessionCookieHeader((name) => store.get(name)?.value);
}

// id null = lokasi baru
export async function saveWorkLocation(id: string | null, input: WorkLocationInput): Promise<WorkLocationActionOutcome> {
  if (id !== null && !z.uuid().safeParse(id).success) return INVALID;
  const parsed = workLocationInputSchema.safeParse(input);
  if (!parsed.success) return { kind: "error", message: parsed.error.issues[0]?.message ?? "Input tidak valid" };
  const result = await apiRequest(id ? `/attendance/locations/${id}` : "/attendance/locations", (data) => workLocationSchema.parse(data), {
    method: id ? "PUT" : "POST",
    body: parsed.data,
    cookieHeader: await cookieHeader(),
  });
  if (!result.ok) return { kind: "error", message: result.error };
  revalidatePath("/settings/locations");
  return { kind: "success" };
}

export async function deleteWorkLocation(id: string): Promise<WorkLocationActionOutcome> {
  if (!z.uuid().safeParse(id).success) return INVALID;
  const result = await apiRequest(`/attendance/locations/${id}`, ignoreData, { method: "DELETE", cookieHeader: await cookieHeader() });
  if (!result.ok) return { kind: "error", message: result.error };
  revalidatePath("/settings/locations");
  return { kind: "success" };
}

export async function updateEmployeeAttendanceSettings(employeeId: string, input: EmployeeAttendanceSettingsInput): Promise<AttendanceSettingsOutcome> {
  if (!z.uuid().safeParse(employeeId).success) return INVALID;
  const parsed = employeeAttendanceSettingsInputSchema.safeParse(input);
  if (!parsed.success) return { kind: "error", message: parsed.error.issues[0]?.message ?? "Input tidak valid" };
  const result = await apiRequest(`/employees/${employeeId}/attendance-settings`, (data) => employeeAttendanceSettingsSchema.parse(data), {
    method: "PUT",
    body: parsed.data,
    cookieHeader: await cookieHeader(),
  });
  if (!result.ok) return { kind: "error", message: result.error };
  revalidatePath(`/employees/${employeeId}`);
  revalidatePath("/settings/locations");
  return { kind: "success", settings: result.data };
}

export async function decideAttendanceReview(recordId: string, event: AttendanceEvent, input: AttendanceReviewDecisionInput): Promise<WorkLocationActionOutcome> {
  if (!z.uuid().safeParse(recordId).success || !ATTENDANCE_EVENTS.includes(event)) return INVALID;
  const parsed = attendanceReviewDecisionSchema.safeParse(input);
  if (!parsed.success) return { kind: "error", message: parsed.error.issues[0]?.message ?? "Input tidak valid" };
  const result = await apiRequest(`/attendance/reviews/${recordId}/${event}`, ignoreData, { method: "PUT", body: parsed.data, cookieHeader: await cookieHeader() });
  if (!result.ok) return { kind: "error", message: result.error };
  revalidatePath("/attendance/review");
  return { kind: "success" };
}

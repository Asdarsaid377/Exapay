"use server";

import { type AttendanceCorrectionInput, attendanceCorrectionInputSchema } from "@exapay/shared";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

import { apiRequest, sessionCookieHeader } from "@/lib/api/server";
import type { CorrectionActionOutcome } from "@/lib/attendanceOutcomes";

// Server Action tipis koreksi absensi (feature 16): validasi ulang → API → revalidate. Hak akses dicek di API (owner/admin).
export async function correctAttendance(input: AttendanceCorrectionInput): Promise<CorrectionActionOutcome> {
  const parsed = attendanceCorrectionInputSchema.safeParse(input);
  if (!parsed.success) return { kind: "error", message: parsed.error.issues[0]?.message ?? "Input tidak valid" };

  const store = await cookies();
  const result = await apiRequest("/attendance/corrections", () => null, {
    method: "POST",
    body: parsed.data,
    cookieHeader: sessionCookieHeader((name) => store.get(name)?.value),
  });
  if (!result.ok) return { kind: "error", message: result.error };
  revalidatePath("/attendance/corrections");
  revalidatePath("/attendance");
  return { kind: "success" };
}

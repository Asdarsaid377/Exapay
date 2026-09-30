"use server";

import { type AttendanceLocation, attendanceClockInputSchema, attendanceRecordSchema } from "@exapay/shared";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

import { apiRequest, sessionCookieHeader } from "@/lib/api/server";
import type { ClockActionOutcome } from "@/lib/attendanceOutcomes";

// Server Action tipis absen masuk/pulang: validasi ulang lokasi → API /attendance/me → revalidate portal. Jam ditentukan API.

async function cookieHeader(): Promise<string | undefined> {
  const store = await cookies();
  return sessionCookieHeader((name) => store.get(name)?.value);
}

async function clock(path: "check-in" | "check-out", location: AttendanceLocation | null): Promise<ClockActionOutcome> {
  const parsed = attendanceClockInputSchema.safeParse({ location });
  // Lokasi tidak valid tidak boleh menggagalkan absen — kirim tanpa lokasi
  const body = parsed.success ? parsed.data : { location: null };
  const result = await apiRequest(`/attendance/me/${path}`, (data) => attendanceRecordSchema.parse(data), {
    method: "POST",
    body,
    cookieHeader: await cookieHeader(),
  });
  if (!result.ok) return { kind: "error", message: result.error };
  revalidatePath("/me");
  revalidatePath("/me/attendance");
  return { kind: "success", record: result.data };
}

export async function checkIn(location: AttendanceLocation | null): Promise<ClockActionOutcome> {
  return clock("check-in", location);
}

export async function checkOut(location: AttendanceLocation | null): Promise<ClockActionOutcome> {
  return clock("check-out", location);
}

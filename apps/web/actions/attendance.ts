"use server";

import { attendanceClockInputSchema, attendanceRecordSchema, SELFIE_MAX_BYTES } from "@exapay/shared";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

import { apiRequest, sessionCookieHeader } from "@/lib/api/server";
import type { ClockActionOutcome } from "@/lib/attendanceOutcomes";

// Server Action tipis absen masuk/pulang: validasi ulang lokasi & ukuran selfie → API /attendance/me (multipart)
// → revalidate portal. Jam ditentukan API; wajib selfie & jenis foto (dari isi file) diperiksa API.

async function cookieHeader(): Promise<string | undefined> {
  const store = await cookies();
  return sessionCookieHeader((name) => store.get(name)?.value);
}

// FormData: location (string JSON / kosong), selfie (opsional — wajib bila karyawan wajib selfie)
async function clock(path: "check-in" | "check-out", formData: FormData): Promise<ClockActionOutcome> {
  const parsed = attendanceClockInputSchema.safeParse({ location: formData.get("location") ?? "" });
  // Lokasi tidak valid tidak boleh menggagalkan absen — kirim tanpa lokasi
  const location = parsed.success ? parsed.data.location : null;
  const selfie = formData.get("selfie");

  const body = new FormData();
  body.set("location", location ? JSON.stringify(location) : "");
  if (selfie instanceof File && selfie.size > 0) {
    if (selfie.size > SELFIE_MAX_BYTES) return { kind: "error", message: "Foto selfie terlalu besar. Ulangi foto." };
    body.set("selfie", selfie, "selfie.jpg");
  }

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

export async function checkIn(formData: FormData): Promise<ClockActionOutcome> {
  return clock("check-in", formData);
}

export async function checkOut(formData: FormData): Promise<ClockActionOutcome> {
  return clock("check-out", formData);
}

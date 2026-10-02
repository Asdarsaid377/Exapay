import { ATTENDANCE_EVENTS, type AttendanceEvent } from "@exapay/shared";
import { cookies } from "next/headers";
import { z } from "zod";

import { apiFetchFile, sessionCookieHeader } from "@/lib/api/server";

// Selfie absen (feature 45): Route Handler meneruskan foto dari API (cakupan dicek API) sebagai <img> inline.
// Gagal → status error tanpa redirect, agar <img> menampilkan state "gagal dimuat" (SelfieThumb).
export async function selfieImageResponse(id: string, event: string): Promise<Response> {
  if (!z.uuid().safeParse(id).success || !ATTENDANCE_EVENTS.includes(event as AttendanceEvent)) return new Response(null, { status: 404 });
  const store = await cookies();
  const response = await apiFetchFile(`/attendance/records/${id}/selfie/${event}`, sessionCookieHeader((name) => store.get(name)?.value));
  if (!response) return new Response(null, { status: 502 });
  if (!response.ok || !response.body) return new Response(null, { status: response.status === 404 ? 404 : 502 });
  return new Response(response.body, {
    headers: {
      "Content-Type": response.headers.get("content-type") ?? "application/octet-stream",
      "Content-Disposition": "inline",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

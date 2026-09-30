import { type MyTaskDay, myTaskDaySchema } from "@exapay/shared";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { type ApiResult, apiFetchFile, apiRequest, sessionCookieHeader } from "@/lib/api/server";

// Log tugas harian milik sendiri (feature 19): portal /me/tasks & kartu "Tugas hari ini" di /me

async function cookieHeader(): Promise<string | undefined> {
  const store = await cookies();
  return sessionCookieHeader((name) => store.get(name)?.value);
}

// date YYYY-MM-DD (sudah divalidasi pemanggil); tanpa tanggal → hari ini di zona waktu usaha
export async function fetchMyTaskDay(date: string | null): Promise<ApiResult<MyTaskDay>> {
  const query = date ? `?date=${date}` : "";
  return apiRequest(`/tasks/me${query}`, (data) => myTaskDaySchema.parse(data), { cookieHeader: await cookieHeader() });
}

// Route Handler foto bukti: file diambil dari API dengan cookie sesi lalu diteruskan (inline).
// Gagal (tanpa akses / storage mati) → kembali ke halaman asal dengan pesan.
export async function taskPhotoResponse(id: string, fallbackUrl: URL): Promise<Response> {
  const response = await apiFetchFile(`/tasks/logs/${encodeURIComponent(id)}/photo`, await cookieHeader());
  if (!response?.ok || !response.body) {
    fallbackUrl.searchParams.set("photo", "error");
    return NextResponse.redirect(fallbackUrl);
  }
  return new Response(response.body, {
    headers: {
      "Content-Type": response.headers.get("content-type") ?? "application/octet-stream",
      "Content-Disposition": "inline",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

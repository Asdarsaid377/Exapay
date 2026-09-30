import {
  type LeaveRequestList,
  type LeaveRequestListQuery,
  leaveRequestListSchema,
  type MyLeaveRequests,
  myLeaveRequestsSchema,
} from "@exapay/shared";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { type ApiResult, apiFetchFile, apiRequest, sessionCookieHeader } from "@/lib/api/server";

// Pengajuan izin/sakit/cuti (feature 15): portal /me/attendance & persetujuan /attendance/requests

async function cookieHeader(): Promise<string | undefined> {
  const store = await cookies();
  return sessionCookieHeader((name) => store.get(name)?.value);
}

// month YYYY-MM (sudah divalidasi pemanggil); tanpa bulan → bulan berjalan di zona waktu usaha
export async function fetchMyLeaveRequests(month: string | null): Promise<ApiResult<MyLeaveRequests>> {
  const query = month ? `?month=${month}` : "";
  return apiRequest(`/attendance/me/leave-requests${query}`, (data) => myLeaveRequestsSchema.parse(data), { cookieHeader: await cookieHeader() });
}

export async function fetchLeaveRequests(query: LeaveRequestListQuery): Promise<ApiResult<LeaveRequestList>> {
  const params = new URLSearchParams({ status: query.status, page: String(query.page) });
  return apiRequest(`/attendance/leave-requests?${params.toString()}`, (data) => leaveRequestListSchema.parse(data), { cookieHeader: await cookieHeader() });
}

// Route Handler lampiran: browser hanya berbicara dengan web — file diambil dari API dengan cookie sesi lalu diteruskan
// (inline, dibuka di tab baru). Gagal (tanpa akses / storage mati) → kembali ke halaman asal dengan pesan.
export async function leaveAttachmentResponse(id: string, fallbackUrl: URL): Promise<Response> {
  const response = await apiFetchFile(`/attendance/leave-requests/${encodeURIComponent(id)}/attachment`, await cookieHeader());
  if (!response?.ok || !response.body) {
    fallbackUrl.searchParams.set("attachment", "error");
    return NextResponse.redirect(fallbackUrl);
  }
  return new Response(response.body, {
    headers: {
      "Content-Type": response.headers.get("content-type") ?? "application/octet-stream",
      "Content-Disposition": response.headers.get("content-disposition") ?? "inline",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

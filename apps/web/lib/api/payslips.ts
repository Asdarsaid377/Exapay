import { type MyPayslipList, myPayslipListSchema, type PayslipRun, payslipRunSchema } from "@exapay/shared";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { type ApiResult, apiFetchFile, apiRequest, sessionCookieHeader } from "@/lib/api/server";

// Slip gaji PDF (feature 31): /payroll/[id]/slips (owner/admin), /me/payslips (karyawan)

async function cookieHeader(): Promise<string | undefined> {
  const store = await cookies();
  return sessionCookieHeader((name) => store.get(name)?.value);
}

// runId sudah divalidasi (uuid)
export async function fetchPayslipRun(runId: string): Promise<ApiResult<PayslipRun>> {
  return apiRequest(`/payroll/runs/${runId}/slips`, (data) => payslipRunSchema.parse(data), { cookieHeader: await cookieHeader() });
}

export async function fetchMyPayslips(): Promise<ApiResult<MyPayslipList>> {
  return apiRequest("/payroll/me/payslips", (data) => myPayslipListSchema.parse(data), { cookieHeader: await cookieHeader() });
}

// Route Handler PDF: browser hanya berbicara dengan web — PDF diambil dari API dengan cookie sesi lalu diteruskan
// (inline, dibuka di tab baru). Gagal (tanpa akses / belum siap / storage mati) → kembali ke halaman asal dengan pesan.
export async function payslipPdfResponse(apiPath: string, fallbackUrl: URL): Promise<Response> {
  const response = await apiFetchFile(apiPath, await cookieHeader());
  if (!response?.ok || !response.body) {
    fallbackUrl.searchParams.set("pdf", "error");
    return NextResponse.redirect(fallbackUrl);
  }
  return new Response(response.body, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": response.headers.get("content-disposition") ?? "inline",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

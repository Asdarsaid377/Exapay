import { type PayrollReport, payrollReportSchema } from "@exapay/shared";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { type ApiResult, apiFetchFile, apiRequest, sessionCookieHeader } from "@/lib/api/server";

// Laporan & ekspor payroll (feature 32): /payroll/reports

async function cookieHeader(): Promise<string | undefined> {
  const store = await cookies();
  return sessionCookieHeader((name) => store.get(name)?.value);
}

// year null = tahun berjalan (ditentukan API)
export async function fetchPayrollReport(year: number | null): Promise<ApiResult<PayrollReport>> {
  return apiRequest(`/payroll/reports${year ? `?year=${year}` : ""}`, (data) => payrollReportSchema.parse(data), { cookieHeader: await cookieHeader() });
}

// Route Handler unduhan Excel: diambil dari API dengan cookie sesi lalu diteruskan sebagai lampiran. Gagal → kembali ke
// halaman laporan dengan pesan.
export async function reportFileResponse(apiPath: string, fallbackUrl: URL): Promise<Response> {
  const response = await apiFetchFile(apiPath, await cookieHeader());
  if (!response?.ok || !response.body) {
    fallbackUrl.searchParams.set("export", "error");
    return NextResponse.redirect(fallbackUrl);
  }
  return new Response(response.body, {
    headers: {
      "Content-Type": response.headers.get("content-type") ?? "application/octet-stream",
      "Content-Disposition": response.headers.get("content-disposition") ?? "attachment",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

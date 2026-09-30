import { cookies } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";

import { apiFetchFile, sessionCookieHeader } from "@/lib/api/server";

// Unduh template impor karyawan (feature 12): browser hanya berbicara dengan web — file diambil dari API
// dengan cookie sesi lalu diteruskan. Gagal (tanpa akses / API mati) → kembali ke halaman impor dengan pesan.
export async function GET(request: NextRequest) {
  const store = await cookies();
  const response = await apiFetchFile("/employees/import/template", sessionCookieHeader((name) => store.get(name)?.value));
  if (!response?.ok || !response.body) return NextResponse.redirect(new URL("/employees/import?template=error", request.url));

  return new Response(response.body, {
    headers: {
      "Content-Type": response.headers.get("content-type") ?? "application/octet-stream",
      "Content-Disposition": response.headers.get("content-disposition") ?? 'attachment; filename="template-impor-karyawan.xlsx"',
      "Cache-Control": "no-store",
    },
  });
}

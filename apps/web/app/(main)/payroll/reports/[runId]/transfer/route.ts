import type { NextRequest } from "next/server";
import { z } from "zod";

import { reportFileResponse } from "@/lib/api/payrollReports";

type Context = { params: Promise<{ runId: string }> };

// Unduh Excel daftar transfer bank satu periode final (owner/admin — dicek API)
export async function GET(request: NextRequest, { params }: Context) {
  const { runId } = await params;
  const id = z.uuid().safeParse(runId);
  if (!id.success) return new Response(null, { status: 404 });
  const back = new URL("/payroll/reports", request.url);
  const year = request.nextUrl.searchParams.get("year");
  if (year && /^\d{4}$/.test(year)) back.searchParams.set("year", year);
  return reportFileResponse(`/payroll/reports/runs/${id.data}/transfer`, back);
}

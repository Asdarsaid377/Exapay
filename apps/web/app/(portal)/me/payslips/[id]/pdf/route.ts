import type { NextRequest } from "next/server";
import { z } from "zod";

import { payslipPdfResponse } from "@/lib/api/payslips";

type Context = { params: Promise<{ id: string }> };

// Buka PDF slip milik sendiri dari portal (hanya slip terbit — dicek API)
export async function GET(request: NextRequest, { params }: Context) {
  const { id } = await params;
  const slipId = z.uuid().safeParse(id);
  if (!slipId.success) return new Response(null, { status: 404 });
  return payslipPdfResponse(`/payroll/me/payslips/${slipId.data}/pdf`, new URL("/me/payslips", request.url));
}

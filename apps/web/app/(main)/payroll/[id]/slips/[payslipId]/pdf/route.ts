import type { NextRequest } from "next/server";
import { z } from "zod";

import { payslipPdfResponse } from "@/lib/api/payslips";

type Context = { params: Promise<{ id: string; payslipId: string }> };

// Buka PDF slip dari halaman slip periode (owner/admin — dicek API; slip boleh dibuka sebelum terbit)
export async function GET(request: NextRequest, { params }: Context) {
  const { id, payslipId } = await params;
  const runId = z.uuid().safeParse(id);
  const slipId = z.uuid().safeParse(payslipId);
  if (!runId.success || !slipId.success) return new Response(null, { status: 404 });
  return payslipPdfResponse(`/payroll/runs/${runId.data}/slips/${slipId.data}/pdf`, new URL(`/payroll/${runId.data}/slips`, request.url));
}

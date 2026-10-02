import type { NextRequest } from "next/server";

import { adminProofResponse } from "@/lib/api/adminBilling";

type Context = { params: Promise<{ tenantId: string; invoiceId: string }> };

// Bukti bayar yang diunggah owner (super-admin — dicek API)
export async function GET(request: NextRequest, { params }: Context) {
  const { tenantId, invoiceId } = await params;
  return adminProofResponse(tenantId, invoiceId, new URL("/admin/billing", request.url));
}

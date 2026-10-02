import type { NextRequest } from "next/server";

import { invoiceQrResponse } from "@/lib/api/billing";
import { BILLING_HREF } from "@/lib/billingLabels";

type Context = { params: Promise<{ id: string }> };

// QRIS tagihan langganan (owner — dicek API). ?download=1 → diunduh sebagai berkas PNG.
export async function GET(request: NextRequest, { params }: Context) {
  const { id } = await params;
  return invoiceQrResponse(id, request.nextUrl.searchParams.has("download"), new URL(BILLING_HREF, request.url));
}

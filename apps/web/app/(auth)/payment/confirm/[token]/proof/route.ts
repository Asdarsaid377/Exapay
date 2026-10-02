import type { NextRequest } from "next/server";

import { confirmationProofResponse } from "@/lib/api/paymentConfirmations";

type Context = { params: Promise<{ token: string }> };

// Bukti bayar dari halaman konfirmasi email — token diteruskan di body POST ke API (hanya membaca)
export async function GET(request: NextRequest, { params }: Context) {
  const { token } = await params;
  return confirmationProofResponse(token, new URL(`/payment/confirm/${encodeURIComponent(token)}`, request.url));
}

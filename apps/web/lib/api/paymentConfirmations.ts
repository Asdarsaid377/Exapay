import { type PaymentConfirmation, paymentConfirmationSchema } from "@exapay/shared";

import { fileOrRedirect } from "@/lib/api/adminBilling";
import { type ApiResult, apiFetchFile, apiRequest } from "@/lib/api/server";

// Halaman konfirmasi pembayaran dari tautan email (feature 42) — tanpa sesi; token dikirim di body ke API

export async function lookupPaymentConfirmation(token: string): Promise<ApiResult<PaymentConfirmation>> {
  return apiRequest("/billing/confirmations/lookup", (data) => paymentConfirmationSchema.parse(data), { method: "POST", body: { token } });
}

export async function confirmationProofResponse(token: string, fallbackUrl: URL): Promise<Response> {
  return fileOrRedirect(await apiFetchFile("/billing/confirmations/proof", undefined, { token }), fallbackUrl, "proof");
}

"use server";

import { paymentConfirmationSchema, rejectPaymentSchema } from "@exapay/shared";

import { apiRequest } from "@/lib/api/server";
import type { PaymentConfirmationOutcome } from "@/lib/billingLabels";

// Server Action halaman konfirmasi pembayaran dari tautan email (feature 42) — tanpa sesi; izin = token di body.

export async function decidePaymentConfirmation(token: string, decision: "confirm" | "reject", reason?: string): Promise<PaymentConfirmationOutcome> {
  if (typeof token !== "string" || token.length < 20 || token.length > 200) return { kind: "error", message: "Tautan tidak valid" };
  let body: { token: string; reason?: string } = { token };
  if (decision === "reject") {
    const parsed = rejectPaymentSchema.safeParse({ reason });
    if (!parsed.success) return { kind: "error", message: parsed.error.issues[0]?.message ?? "Alasan tidak valid" };
    body = { token, reason: parsed.data.reason };
  }
  const result = await apiRequest(`/billing/confirmations/${decision}`, (data) => paymentConfirmationSchema.parse(data), { method: "POST", body });
  if (!result.ok) return { kind: "error", message: result.error };
  return { kind: "success", confirmation: result.data };
}

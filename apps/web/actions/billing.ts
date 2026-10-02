"use server";

import { BILLING_PROOF_MAX_BYTES, billingInvoiceSchema } from "@exapay/shared";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod";

import { apiRequest, sessionCookieHeader } from "@/lib/api/server";
import { BILLING_HREF, type BillingActionOutcome } from "@/lib/billingLabels";

// Server Action tipis tagihan langganan (feature 41): validasi ulang → API → revalidate. Hak akses dicek di API.

const PROOF_EXTENSIONS = [".pdf", ".jpg", ".jpeg", ".png"];

// FormData: invoiceId, proof (opsional). Jenis file sebenarnya diperiksa API dari isi file.
export async function claimInvoicePayment(formData: FormData): Promise<BillingActionOutcome> {
  const invoiceId = z.uuid().safeParse(formData.get("invoiceId"));
  if (!invoiceId.success) return { kind: "error", message: "Tagihan tidak valid" };

  const body = new FormData();
  const file = formData.get("proof");
  if (file instanceof File && file.size > 0) {
    if (!PROOF_EXTENSIONS.some((ext) => file.name.toLowerCase().endsWith(ext))) return { kind: "error", message: "Bukti bayar harus berupa PDF, JPG, atau PNG" };
    if (file.size > BILLING_PROOF_MAX_BYTES) return { kind: "error", message: "Bukti bayar terlalu besar (maks. 5 MB)" };
    body.set("proof", file, file.name);
  }

  const store = await cookies();
  const result = await apiRequest(`/billing/invoices/${invoiceId.data}/claim`, (data) => billingInvoiceSchema.parse(data), {
    method: "POST",
    body,
    cookieHeader: sessionCookieHeader((name) => store.get(name)?.value),
  });
  if (!result.ok) return { kind: "error", message: result.error };
  revalidatePath(BILLING_HREF);
  return { kind: "success" };
}

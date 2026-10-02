import type { BillingInvoiceStatus, EffectiveSubscriptionStatus, PaymentConfirmation, SubscriptionSummary } from "@exapay/shared";

import type { BadgeTone } from "@/components/common/Badge";
import { formatDate } from "@/lib/datetime";

export const BILLING_HREF = "/settings/billing";

export const SUBSCRIPTION_STATUS_LABELS: Record<EffectiveSubscriptionStatus, string> = {
  trialing: "Trial",
  active: "Aktif",
  complimentary: "Gratis (pilot)",
  past_due: "Masa tenggang",
  read_only: "Baca-saja",
};

export const SUBSCRIPTION_STATUS_TONES: Record<EffectiveSubscriptionStatus, BadgeTone> = {
  trialing: "info",
  active: "success",
  complimentary: "accent",
  past_due: "warning",
  read_only: "danger",
};

// "hari ini" / "besok" / "dalam 5 hari"
export function daysLeftLabel(daysLeft: number): string {
  if (daysLeft <= 0) return "hari ini";
  if (daysLeft === 1) return "besok";
  return `dalam ${daysLeft} hari`;
}

// "Masa trial" / "Langganan" — status tersimpan menentukan apa yang berakhir
export function periodNoun(summary: SubscriptionSummary): string {
  return summary.baseStatus === "trialing" ? "Masa trial" : "Langganan";
}

export function formatSubscriptionDate(iso: string | null): string {
  return iso ? formatDate(iso) : "—";
}

// ——— Tagihan (feature 41) ———

export const INVOICE_STATUS_LABELS: Record<BillingInvoiceStatus, string> = {
  open: "Belum dibayar",
  awaiting_confirmation: "Menunggu konfirmasi",
  paid: "Lunas",
  expired: "Kedaluwarsa",
};

export const INVOICE_STATUS_TONES: Record<BillingInvoiceStatus, BadgeTone> = {
  open: "accent",
  awaiting_confirmation: "warning",
  paid: "success",
  expired: "outline",
};

// Gambar QRIS lewat Route Handler (browser tidak pernah ke API langsung); download → lampiran berkas PNG
export function invoiceQrHref(invoiceId: string, download = false): string {
  return `${BILLING_HREF}/invoices/${invoiceId}/qris${download ? "?download=1" : ""}`;
}

// Hasil Server Action tagihan untuk Client Component. Pesan error sudah human-readable.
export type BillingActionOutcome = { kind: "error"; message: string } | { kind: "success" };

export type PaymentConfirmationOutcome = { kind: "error"; message: string } | { kind: "success"; confirmation: PaymentConfirmation };

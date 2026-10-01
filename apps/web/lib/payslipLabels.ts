import type { PayslipEmailStatus, PayslipRow, PayslipStatus } from "@exapay/shared";

import type { BadgeTone } from "@/components/common/Badge";
import { formatDateTime } from "@/lib/datetime";

// Label & tautan slip gaji (feature 31) — /payroll/[id]/slips, /me/payslips

export type PayslipActionOutcome = { kind: "error"; message: string } | { kind: "success" };
export type PublishPayslipsOutcome = { kind: "error"; message: string } | { kind: "success"; published: number; emailed: number };

export const PAYSLIP_STATUS_LABELS: Record<PayslipStatus, string> = {
  pending: "Menunggu",
  generating: "Sedang dibuat",
  ready: "Siap",
  failed: "Gagal dibuat",
};
export const PAYSLIP_STATUS_TONES: Record<PayslipStatus, BadgeTone> = {
  pending: "neutral",
  generating: "neutral",
  ready: "success",
  failed: "danger",
};

export const EMAIL_STATUS_LABELS: Record<PayslipEmailStatus, string> = {
  queued: "Email dikirim…",
  sent: "Email terkirim",
  failed: "Email gagal",
};

// Masih ada slip yang sedang diproses worker → halaman dimuat ulang berkala
export function payslipsInProgress(rows: readonly PayslipRow[]): boolean {
  return rows.some((row) => row.status === "pending" || row.status === "generating" || row.email?.status === "queued");
}

// Keterangan email satu slip untuk tabel admin
export function emailSummary(row: PayslipRow): string {
  if (!row.publishedAt) return row.hasPortalAccount ? "Email dikirim saat diterbitkan" : "Tanpa akun portal";
  if (!row.email) return row.hasPortalAccount ? "Belum dikirim email" : "Tanpa akun portal — bagikan PDF langsung";
  if (row.email.status === "sent" && row.email.sentAt) return `Email terkirim ke ${row.email.to} · ${formatDateTime(row.email.sentAt)}`;
  if (row.email.status === "failed") return row.email.error ?? "Email gagal dikirim";
  return `Dikirim ke ${row.email.to}`;
}

export function payslipsHref(runId: string): string {
  return `/payroll/${runId}/slips`;
}

// PDF dibuka lewat Route Handler area masing-masing (proxy menjaga peran per area)
export function staffPayslipPdfHref(runId: string, payslipId: string): string {
  return `/payroll/${runId}/slips/${payslipId}/pdf`;
}

export function myPayslipPdfHref(payslipId: string): string {
  return `/me/payslips/${payslipId}/pdf`;
}

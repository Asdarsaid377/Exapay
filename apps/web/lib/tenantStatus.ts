import type { TenantOwnerState, TenantStatus, TenantStatusFilter } from "@exapay/shared";

import type { BadgeTone } from "@/components/common/Badge";

// Label & warna status tenant untuk panel super-admin
export const TENANT_STATUS_LABELS: Record<TenantStatus, string> = {
  active: "Aktif",
  pending_owner: "Menunggu pemilik",
  deactivated: "Nonaktif",
};

export const TENANT_STATUS_TONES: Record<TenantStatus, BadgeTone> = {
  active: "success",
  pending_owner: "warning",
  deactivated: "neutral",
};

export const TENANT_FILTER_LABELS: Record<TenantStatusFilter, string> = {
  all: "Semua",
  ...TENANT_STATUS_LABELS,
};

export const OWNER_STATE_LABELS: Record<TenantOwnerState, string> = {
  active: "Sudah membuat akun",
  unverified: "Email belum diverifikasi",
  invited: "Undangan terkirim",
  invitation_expired: "Undangan kedaluwarsa",
};

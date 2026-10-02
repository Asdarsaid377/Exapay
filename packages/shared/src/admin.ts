import { z } from "zod";

import { TENANT_SUBSCRIPTION_STARTS } from "./billing.js";
import type { MembershipRole } from "./roles.js";

// Panel super-admin (feature 07). Super-admin hanya melihat data tingkat platform:
// nama usaha, status, pemilik, dan jumlah pengguna — tidak pernah data karyawan/gaji.

// active: punya pemilik & aktif · pending_owner: undangan pemilik belum diterima · deactivated: tidak bisa login
export const TENANT_STATUSES = ["active", "pending_owner", "deactivated"] as const;
export type TenantStatus = (typeof TENANT_STATUSES)[number];

export const TENANT_STATUS_FILTERS = ["all", ...TENANT_STATUSES] as const;
export type TenantStatusFilter = (typeof TENANT_STATUS_FILTERS)[number];

export const ADMIN_TENANTS_PAGE_SIZE = 20;

export const adminTenantListQuerySchema = z.object({
  q: z.string().trim().max(120).optional().default(""),
  status: z.enum(TENANT_STATUS_FILTERS).optional().default("all"),
  page: z.coerce.number().int().min(1).optional().default(1),
});
export type AdminTenantListQuery = z.infer<typeof adminTenantListQuerySchema>;

export const createTenantSchema = z.object({
  name: z.string().trim().min(2, "Nama usaha minimal 2 karakter").max(120, "Nama usaha maksimal 120 karakter"),
  ownerFullName: z.string().trim().min(2, "Nama pemilik minimal 2 karakter").max(100, "Nama pemilik maksimal 100 karakter"),
  ownerEmail: z.email("Format email tidak valid").trim(),
  // trial = trial gratis seperti signup mandiri; complimentary = gratis (pilot) tanpa batas
  subscription: z.enum(TENANT_SUBSCRIPTION_STARTS, "Pilih jenis langganan").default("trial"),
});
export type CreateTenantInput = z.infer<typeof createTenantSchema>;

// active: pemilik sudah bisa masuk · unverified: signup mandiri, email belum diverifikasi
// invited: undangan pemilik masih berlaku · invitation_expired: undangan kedaluwarsa (kirim ulang)
export const TENANT_OWNER_STATES = ["active", "unverified", "invited", "invitation_expired"] as const;
export type TenantOwnerState = (typeof TENANT_OWNER_STATES)[number];

export type AdminTenantOwner = {
  fullName: string;
  email: string;
  state: TenantOwnerState;
  // Hanya untuk state invited / invitation_expired (ISO 8601)
  invitedAt: string | null;
  invitationExpiresAt: string | null;
};

export type AdminTenantListItem = {
  id: string;
  name: string;
  status: TenantStatus;
  createdAt: string;
  owner: AdminTenantOwner | null;
  memberCount: number;
};

export type AdminTenantList = {
  items: AdminTenantListItem[];
  total: number;
  page: number;
  pageSize: number;
  // Jumlah per status tanpa filter (untuk stat tile & tab filter)
  counts: Record<TenantStatusFilter, number>;
};

export type AdminTenantDetail = {
  id: string;
  name: string;
  status: TenantStatus;
  createdAt: string;
  deactivatedAt: string | null;
  owner: AdminTenantOwner | null;
  memberCounts: Record<MembershipRole, number>;
  pendingInvitations: number;
};

export type CreatedTenant = { id: string };

// Validasi respons API di web (respons tidak dipercaya begitu saja)
const adminTenantOwnerSchema: z.ZodType<AdminTenantOwner> = z.object({
  fullName: z.string(),
  email: z.string(),
  state: z.enum(TENANT_OWNER_STATES),
  invitedAt: z.string().nullable(),
  invitationExpiresAt: z.string().nullable(),
});

const countsSchema = z.object({ all: z.number(), active: z.number(), pending_owner: z.number(), deactivated: z.number() });

export const adminTenantListSchema: z.ZodType<AdminTenantList> = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      status: z.enum(TENANT_STATUSES),
      createdAt: z.string(),
      owner: adminTenantOwnerSchema.nullable(),
      memberCount: z.number(),
    }),
  ),
  total: z.number(),
  page: z.number(),
  pageSize: z.number(),
  counts: countsSchema,
});

export const adminTenantDetailSchema: z.ZodType<AdminTenantDetail> = z.object({
  id: z.string(),
  name: z.string(),
  status: z.enum(TENANT_STATUSES),
  createdAt: z.string(),
  deactivatedAt: z.string().nullable(),
  owner: adminTenantOwnerSchema.nullable(),
  memberCounts: z.object({ owner: z.number(), admin: z.number(), atasan: z.number(), karyawan: z.number() }),
  pendingInvitations: z.number(),
});

export const createdTenantSchema: z.ZodType<CreatedTenant> = z.object({ id: z.string() });

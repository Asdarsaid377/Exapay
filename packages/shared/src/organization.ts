import { z } from "zod";

// Departemen & jabatan (feature 10, /organization). Dua daftar independen per tenant.

export const ORG_KINDS = ["departments", "positions"] as const;
export type OrgKind = (typeof ORG_KINDS)[number];

export const orgItemSchema = z.object({
  name: z.string().trim().min(2, "Nama minimal 2 karakter").max(80, "Nama maksimal 80 karakter"),
});
export type OrgItemInput = z.infer<typeof orgItemSchema>;

export type OrgItem = {
  id: string;
  name: string;
  createdAt: string;
};

export type Organization = {
  departments: OrgItem[];
  positions: OrgItem[];
  // Owner/admin boleh tambah/ubah/hapus; atasan hanya melihat
  canManage: boolean;
};

const orgItemResponseSchema: z.ZodType<OrgItem> = z.object({ id: z.string(), name: z.string(), createdAt: z.string() });

// Validasi respons API di web
export const organizationSchema: z.ZodType<Organization> = z.object({
  departments: z.array(orgItemResponseSchema),
  positions: z.array(orgItemResponseSchema),
  canManage: z.boolean(),
});

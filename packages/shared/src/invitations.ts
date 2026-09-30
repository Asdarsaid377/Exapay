import { z } from "zod";

import { newPasswordSchema } from "./auth.js";
import { MEMBERSHIP_ROLES, type MembershipRole } from "./roles.js";

// Undangan bergabung ke tenant (fondasi feature 07: undangan pemilik oleh super-admin; feature 08 menambah undangan dari tenant).

export const invitationTokenSchema = z.object({
  token: z.string().min(1, "Tautan undangan tidak valid"),
});
export type InvitationTokenInput = z.infer<typeof invitationTokenSchema>;

// Akun baru wajib mengisi nama + password. Akun yang sudah ada cukup token (password lama tetap dipakai).
export const acceptInvitationSchema = z.object({
  token: z.string().min(1, "Tautan undangan tidak valid"),
  fullName: z.string().trim().min(2, "Nama lengkap minimal 2 karakter").max(100, "Nama lengkap maksimal 100 karakter").optional(),
  password: newPasswordSchema.optional(),
});
export type AcceptInvitationInput = z.infer<typeof acceptInvitationSchema>;

export type InvitationPreview = {
  tenantName: string;
  email: string;
  // Nama yang diisi pengundang — bisa diubah penerima saat membuat akun
  fullName: string;
  role: MembershipRole;
  // true: email sudah punya akun Exapay → cukup terima, tanpa membuat password
  accountExists: boolean;
  expiresAt: string;
  expired: boolean;
};

export const invitationPreviewSchema: z.ZodType<InvitationPreview> = z.object({
  tenantName: z.string(),
  email: z.string(),
  fullName: z.string(),
  role: z.enum(MEMBERSHIP_ROLES),
  accountExists: z.boolean(),
  expiresAt: z.string(),
  expired: z.boolean(),
});

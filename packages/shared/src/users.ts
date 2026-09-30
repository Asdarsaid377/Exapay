import { z } from "zod";

import { MEMBERSHIP_ROLES, type MembershipRole } from "./roles.js";

// Pengguna & undangan satu tenant (feature 08, /settings/users). Hanya owner & admin.
// Wewenang: owner mengelola semua peran; admin hanya atasan & karyawan. Tidak ada yang mengubah/mencabut dirinya sendiri.

// Peran yang boleh diberikan / dikelola oleh peran pengelola ini (sumber tunggal untuk API & web)
export const MANAGEABLE_ROLES: Record<MembershipRole, readonly MembershipRole[]> = {
  owner: ["owner", "admin", "atasan", "karyawan"],
  admin: ["atasan", "karyawan"],
  atasan: [],
  karyawan: [],
};

export function canManageRole(actor: MembershipRole, target: MembershipRole): boolean {
  return MANAGEABLE_ROLES[actor].includes(target);
}

export const inviteUserSchema = z.object({
  fullName: z.string().trim().min(2, "Nama lengkap minimal 2 karakter").max(100, "Nama lengkap maksimal 100 karakter"),
  email: z.email("Format email tidak valid").trim(),
  role: z.enum(MEMBERSHIP_ROLES, "Pilih peran"),
});
export type InviteUserInput = z.infer<typeof inviteUserSchema>;

export const changeMemberRoleSchema = z.object({
  role: z.enum(MEMBERSHIP_ROLES, "Pilih peran"),
});
export type ChangeMemberRoleInput = z.infer<typeof changeMemberRoleSchema>;

export type TenantMember = {
  membershipId: string;
  fullName: string;
  email: string;
  role: MembershipRole;
  joinedAt: string;
  isSelf: boolean;
  // Pengguna yang meminta boleh mengubah peran / mencabut akses anggota ini
  canManage: boolean;
};

export type TenantPendingInvitation = {
  id: string;
  fullName: string;
  email: string;
  role: MembershipRole;
  invitedAt: string;
  expiresAt: string;
  expired: boolean;
  // null jika pengundang bukan anggota usaha ini (mis. super-admin)
  invitedByName: string | null;
  canManage: boolean;
};

export type TenantUsersOverview = {
  members: TenantMember[];
  invitations: TenantPendingInvitation[];
  // Peran yang boleh diberikan pengguna yang meminta (form undang & ubah peran)
  assignableRoles: MembershipRole[];
};

// Validasi respons API di web
export const tenantUsersOverviewSchema: z.ZodType<TenantUsersOverview> = z.object({
  members: z.array(
    z.object({
      membershipId: z.string(),
      fullName: z.string(),
      email: z.string(),
      role: z.enum(MEMBERSHIP_ROLES),
      joinedAt: z.string(),
      isSelf: z.boolean(),
      canManage: z.boolean(),
    }),
  ),
  invitations: z.array(
    z.object({
      id: z.string(),
      fullName: z.string(),
      email: z.string(),
      role: z.enum(MEMBERSHIP_ROLES),
      invitedAt: z.string(),
      expiresAt: z.string(),
      expired: z.boolean(),
      invitedByName: z.string().nullable(),
      canManage: z.boolean(),
    }),
  ),
  assignableRoles: z.array(z.enum(MEMBERSHIP_ROLES)),
});

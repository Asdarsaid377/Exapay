// Peran pengguna di dalam satu tenant (tabel memberships). Super-admin bukan peran tenant.
export const MEMBERSHIP_ROLES = ["owner", "admin", "atasan", "karyawan"] as const;

export type MembershipRole = (typeof MEMBERSHIP_ROLES)[number];

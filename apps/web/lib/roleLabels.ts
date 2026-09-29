import type { MembershipRole } from "@exapay/shared";

// Label peran untuk tampilan UI (Bahasa Indonesia)
export const ROLE_LABELS: Record<MembershipRole, string> = {
  owner: "Pemilik",
  admin: "Admin",
  atasan: "Atasan",
  karyawan: "Karyawan",
};

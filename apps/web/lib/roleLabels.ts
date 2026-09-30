import type { MembershipRole } from "@exapay/shared";

// Label peran untuk tampilan UI (Bahasa Indonesia)
export const ROLE_LABELS: Record<MembershipRole, string> = {
  owner: "Pemilik",
  admin: "Admin",
  atasan: "Atasan",
  karyawan: "Karyawan",
};

// Penjelasan singkat peran di form undang & ubah peran (project-overview "Tentang Project")
export const ROLE_DESCRIPTIONS: Record<MembershipRole, string> = {
  owner: "Akses penuh, termasuk mengelola pemilik dan admin lain.",
  admin: "Mengelola data karyawan, absensi, KPI, dan payroll.",
  atasan: "Memverifikasi tugas dan menilai kinerja bawahan langsung.",
  karyawan: "Absen, mencatat tugas harian, dan melihat slip gaji dari HP.",
};

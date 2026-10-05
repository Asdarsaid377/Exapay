import { redirect } from "next/navigation";

import { fetchMyProfile } from "@/lib/api/employees";
import { INACTIVE_PORTAL_HOME } from "@/lib/navigation";

// Karyawan nonaktif (sudah keluar / belum mulai bekerja) hanya membuka Slip & Profil di portal (keputusan user feature 37).
// Hanya tampilan/routing — API tetap menolak absen, catat tugas, dan pengajuan izin untuk karyawan nonaktif.

export async function isInactiveEmployee(): Promise<boolean> {
  const profile = await fetchMyProfile();
  // Profil gagal dimuat → jangan mengunci menu; halaman masing-masing menampilkan errornya sendiri
  return profile.ok && profile.data.access === "inactive";
}

// Owner/admin/atasan "memenuhi syarat absen" = tertaut ke data karyawan aktif. Dipakai untuk meneruskan beranda /me ke
// /dashboard dan menampilkan menu "Absen saya" di area sidebar. Profil gagal dimuat → anggap memenuhi (jangan menyembunyikan absen).
export async function canUsePortalAttendance(): Promise<boolean> {
  const profile = await fetchMyProfile();
  return !profile.ok || profile.data.access === "ok";
}

// Dipanggil halaman portal selain Slip & Profil
export async function requireActiveEmployee(): Promise<void> {
  if (await isInactiveEmployee()) redirect(INACTIVE_PORTAL_HOME);
}

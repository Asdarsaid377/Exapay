import type { SetupGuide, SetupStepKey } from "@exapay/shared";

// Isi kartu panduan setup (feature 48, snapshot context/designs/setup-guide.html). Tujuan tiap langkah = halaman yang ada.

export type SetupStepContent = {
  title: string;
  description: string;
  action: string;
  href: string;
  // Tautan sekunder di langkah berikutnya: halaman lain, atau aksi "Tandai sudah dicek" (jadwal kerja)
  secondary?: { label: string; href: string } | { label: string; action: "schedule_checked" };
  // Teks sub-progres "8 dari 12 karyawan sudah diatur"
  progressLabel?: (done: number, total: number) => string;
};

export function setupStepContent(key: SetupStepKey, guide: SetupGuide): SetupStepContent {
  switch (key) {
    case "company_profile":
      return {
        title: "Lengkapi profil usaha",
        description: "Isi kota usaha (menentukan zona waktu & UMK) dan tanggal gajian.",
        action: "Lengkapi profil",
        href: "/settings/company",
      };
    case "organization":
      return {
        title: "Buat departemen & jabatan",
        description: "Kelompokkan karyawan, mis. Operasional · Barista. Jabatan dipakai untuk gaji dan KPI.",
        action: "Atur organisasi",
        href: "/organization",
      };
    case "work_schedule":
      return {
        title: "Cek jadwal kerja & hari libur",
        description: "Jadwal bawaan Senin–Jumat 08.00–17.00 sudah kami buat. Cukup dicek, ubah bila perlu.",
        action: "Cek jadwal",
        href: "/settings/attendance",
        secondary: { label: "Tandai sudah dicek", action: "schedule_checked" },
      };
    case "employees":
      return {
        title: "Tambah karyawan",
        description: "Masukkan satu per satu atau impor sekaligus dari Excel.",
        action: "Tambah karyawan",
        href: "/employees/new",
        secondary: { label: "Impor Excel", href: "/employees/import" },
      };
    case "salaries":
      return {
        title: "Atur gaji karyawan",
        description: "Isi gaji pokok, tunjangan, dan kepesertaan BPJS tiap karyawan.",
        action: "Atur gaji",
        // Langsung ke tab Gaji karyawan pertama yang belum diatur
        href: guide.employeeWithoutSalaryId ? `/employees/${guide.employeeWithoutSalaryId}?tab=salary` : "/employees",
        progressLabel: (done, total) => `${done} dari ${total} karyawan sudah diatur`,
      };
    case "portal_accounts":
      return {
        title: "Undang karyawan ke portal",
        description: "Agar karyawan bisa absen dari HP dan melihat slip gaji.",
        action: "Undang karyawan",
        href: "/settings/users",
        progressLabel: (done, total) => `${done} dari ${total} karyawan punya akun`,
      };
    case "first_payroll":
      return {
        title: "Buka periode gaji pertama",
        description: "Gaji, BPJS, dan PPh 21 dihitung otomatis. Cek draf, lalu finalkan.",
        action: "Buka periode gaji",
        href: "/payroll",
      };
  }
}

export const SETUP_EXTRAS = [
  { title: "Lokasi kerja", description: "Cek lokasi karyawan saat absen", href: "/settings/locations" },
  { title: "Shift kerja", description: "Untuk usaha dengan jam bergilir", href: "/settings/attendance" },
  { title: "Aturan potongan absensi", description: "Potongan telat dan alpa", href: "/settings/attendance" },
  { title: "Template KPI per jabatan", description: "Target tugas harian tiap jabatan", href: "/kpi/templates" },
] as const;

// Kartu panduan tampil: belum dilewati & belum ditutup (semua selesai → kartu "siap dipakai" sampai ditutup)
export function setupGuideVisible(guide: SetupGuide): boolean {
  return !guide.hidden && !guide.closed;
}

// Item "Panduan setup 4/7" di menu akun: hanya selama disembunyikan & belum selesai
export function setupGuideMenuLabel(guide: SetupGuide): string | null {
  return guide.hidden && !guide.closed && !guide.allDone ? `${guide.completedCount}/${guide.totalCount}` : null;
}

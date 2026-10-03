import { z } from "zod";

// Panduan setup awal (feature 48, design setup-guide.html): kartu "Siapkan Exapay" di dashboard owner/admin.
// Tanda selesai tiap langkah dihitung API dari data (bukan dicentang manual) — kecuali jadwal kerja, yang dibuat otomatis
// saat daftar: selesai bila jadwal pernah diubah atau ditandai "sudah dicek". Lewati = disembunyikan untuk seluruh usaha.

export const SETUP_STEP_KEYS = ["company_profile", "organization", "work_schedule", "employees", "salaries", "portal_accounts", "first_payroll"] as const;
export type SetupStepKey = (typeof SETUP_STEP_KEYS)[number];

export const setupGuideSchema = z.object({
  steps: z.array(
    z.object({
      key: z.enum(SETUP_STEP_KEYS),
      done: z.boolean(),
      // Sub-progres langkah (karyawan sudah diatur gajinya / punya akun portal) — null bila tidak relevan
      progress: z.object({ done: z.number().int(), total: z.number().int() }).nullable(),
    }),
  ),
  completedCount: z.number().int(),
  totalCount: z.number().int(),
  allDone: z.boolean(),
  // Dilewati (disembunyikan) — bisa dibuka lagi dari menu akun
  hidden: z.boolean(),
  // Kartu "Exapay siap dipakai" sudah ditutup → panduan tidak muncul lagi
  closed: z.boolean(),
  // Karyawan aktif pertama yang belum punya gaji (tautan langsung ke tab Gaji) — null bila semua sudah
  employeeWithoutSalaryId: z.string().nullable(),
});
export type SetupGuide = z.infer<typeof setupGuideSchema>;

export const setupGuideVisibilityInputSchema = z.object({ hidden: z.boolean() });
export type SetupGuideVisibilityInput = z.infer<typeof setupGuideVisibilityInputSchema>;

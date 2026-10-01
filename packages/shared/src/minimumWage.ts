import { z } from "zod";

// Peringatan upah minimum (feature 34). Upah karyawan = gaji pokok + tunjangan tetap (komponen `base_salary` +
// `fixed_allowance`) dari versi gaji yang berlaku — dasar kepatuhan upah minimum (PP 36/2021), sama dengan dasar
// upah BPJS di payroll-engine. Dibandingkan dengan UMK kota/kabupaten lokasi usaha (fallback UMP provinsi) yang berlaku
// hari ini (zona waktu usaha), plus peringatan dini untuk versi upah minimum berikutnya yang sudah ada di data regulasi.
// Hanya untuk owner/admin (atasan tidak melihat gaji). Uang = string desimal.

export const minimumWageReferenceSchema = z.object({
  scope: z.enum(["regency", "province"]),
  // "Kota Makassar" · "Sulawesi Selatan"
  areaName: z.string(),
  monthlyAmount: z.string(),
  effectiveFrom: z.string(),
  effectiveTo: z.string().nullable(),
});
export type MinimumWageReference = z.infer<typeof minimumWageReferenceSchema>;

// below = di bawah upah minimum yang berlaku sekarang · below_upcoming = patuh sekarang, di bawah versi berikutnya
export const MINIMUM_WAGE_FLAG_STATUSES = ["below", "below_upcoming"] as const;
export type MinimumWageFlagStatus = (typeof MINIMUM_WAGE_FLAG_STATUSES)[number];

export const minimumWageFlagSchema = z.object({
  status: z.enum(MINIMUM_WAGE_FLAG_STATUSES),
  // Gaji pokok + tunjangan tetap pada tanggal pembanding
  wage: z.string(),
  minimumWage: z.string(),
  // Tanggal pembanding (hari ini / mulai karyawan masuk / mulai berlakunya upah minimum berikutnya)
  checkedOn: z.string(),
});
export type MinimumWageFlag = z.infer<typeof minimumWageFlagSchema>;

export const minimumWageEmployeeSchema = z.object({
  employee: z.object({ id: z.string(), fullName: z.string() }),
  flag: minimumWageFlagSchema,
});
export type MinimumWageEmployee = z.infer<typeof minimumWageEmployeeSchema>;

export const minimumWageSummarySchema = z.object({
  // false = lokasi usaha belum diatur di Profil usaha → tidak bisa dicek
  locationSet: z.boolean(),
  current: minimumWageReferenceSchema.nullable(),
  upcoming: minimumWageReferenceSchema.nullable(),
  // Karyawan aktif yang ditandai, urut nama
  employees: z.array(minimumWageEmployeeSchema),
});
export type MinimumWageSummary = z.infer<typeof minimumWageSummarySchema>;

// "UMK Kota Makassar 2026" · "UMP Sulawesi Selatan 2027"
export function minimumWageLabel(reference: MinimumWageReference, withArea = true): string {
  const kind = reference.scope === "regency" ? "UMK" : "UMP";
  const year = reference.effectiveFrom.slice(0, 4);
  return withArea ? `${kind} ${reference.areaName} ${year}` : `${kind} ${year}`;
}

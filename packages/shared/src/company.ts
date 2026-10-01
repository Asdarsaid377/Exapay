import { z } from "zod";

// Profil usaha (feature 09, /settings/company) + referensi wilayah (provinsi & kabupaten/kota Kemendagri).

export const PAYDAY_MIN = 1;
export const PAYDAY_MAX = 31;
// Tanggal tutup buku absensi (feature 30b): 1–28 (ada di semua bulan); null = akhir bulan
export const CUTOFF_DAY_MIN = 1;
export const CUTOFF_DAY_MAX = 28;

// Gajian jatuh pada/sebelum tutup buku → payroll belum bisa difinalisasi di hari gajian
export function paydayBeforeCutoff(payday: number | null, cutoffDay: number | null): boolean {
  return payday !== null && (cutoffDay === null || payday <= cutoffDay);
}

// Teks kosong → null (kolom opsional)
const optionalText = (max: number, message: string) =>
  z
    .string()
    .trim()
    .max(max, message)
    .nullable()
    .transform((value) => (value ? value : null));

// NPWP badan: tanda baca boleh diketik (mis. 01.234.567.8-901.000), disimpan hanya digit. 15 digit lama / 16 digit sejak 2024.
const npwpSchema = z
  .string()
  .nullable()
  .transform((value) => (value ? value.replace(/[\s.-]/g, "") : null))
  .refine((value) => value === null || /^[0-9]{15,16}$/.test(value), "NPWP harus 15 atau 16 digit angka");

export const updateCompanyProfileSchema = z.object({
  name: z.string().trim().min(2, "Nama usaha minimal 2 karakter").max(120, "Nama usaha maksimal 120 karakter"),
  address: optionalText(500, "Alamat maksimal 500 karakter"),
  npwp: npwpSchema,
  regencyCode: z
    .string()
    .regex(/^[0-9]{2}\.[0-9]{2}$/, "Pilih kota/kabupaten")
    .nullable(),
  payday: z
    .number("Pilih tanggal gajian")
    .int()
    .min(PAYDAY_MIN, "Tanggal gajian 1–31")
    .max(PAYDAY_MAX, "Tanggal gajian 1–31")
    .nullable(),
  attendanceCutoffDay: z
    .number("Pilih tanggal tutup buku")
    .int()
    .min(CUTOFF_DAY_MIN, "Tanggal tutup buku 1–28")
    .max(CUTOFF_DAY_MAX, "Tanggal tutup buku 1–28")
    .nullable(),
});
// Nilai form sebelum dinormalisasi (web) vs sesudah (API)
export type UpdateCompanyProfileInput = z.input<typeof updateCompanyProfileSchema>;
export type UpdateCompanyProfile = z.output<typeof updateCompanyProfileSchema>;

export type CompanyRegency = {
  code: string;
  name: string;
  provinceCode: string;
  provinceName: string;
};

export type CompanyProfile = {
  name: string;
  address: string | null;
  // Hanya digit
  npwp: string | null;
  regency: CompanyRegency | null;
  payday: number | null;
  attendanceCutoffDay: number | null;
  updatedAt: string;
};

export type RegionProvince = {
  code: string;
  name: string;
  regencies: { code: string; name: string }[];
};

// Validasi respons API di web
export const companyProfileSchema: z.ZodType<CompanyProfile> = z.object({
  name: z.string(),
  address: z.string().nullable(),
  npwp: z.string().nullable(),
  regency: z.object({ code: z.string(), name: z.string(), provinceCode: z.string(), provinceName: z.string() }).nullable(),
  payday: z.number().nullable(),
  attendanceCutoffDay: z.number().nullable(),
  updatedAt: z.string(),
});

export const regionProvincesSchema: z.ZodType<RegionProvince[]> = z.array(
  z.object({
    code: z.string(),
    name: z.string(),
    regencies: z.array(z.object({ code: z.string(), name: z.string() })),
  }),
);

// Tampilan NPWP: 15 digit → 00.000.000.0-000.000; 16 digit ditampilkan apa adanya (format DJP baru tanpa tanda baca)
export function formatNpwp(digits: string): string {
  if (digits.length !== 15) return digits;
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}.${digits.slice(8, 9)}-${digits.slice(9, 12)}.${digits.slice(12)}`;
}

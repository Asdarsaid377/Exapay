import { z } from "zod";

// Data karyawan (feature 11, /employees). NIK, NPWP, dan nomor rekening disimpan terenkripsi di API
// dan hanya keluar dalam bentuk tersamar — nilai penuh lewat aksi "Tampilkan" (owner/admin, tercatat di audit log).

export const EMPLOYMENT_STATUSES = ["permanent", "contract", "probation"] as const;
export type EmploymentStatus = (typeof EMPLOYMENT_STATUSES)[number];

export const GENDERS = ["male", "female"] as const;
export type Gender = (typeof GENDERS)[number];

// Status PTKP untuk PPh 21: TK = tidak kawin, K = kawin; angka = jumlah tanggungan (maks 3)
export const PTKP_STATUSES = ["TK/0", "TK/1", "TK/2", "TK/3", "K/0", "K/1", "K/2", "K/3"] as const;
export type PtkpStatus = (typeof PTKP_STATUSES)[number];

// Filter daftar: aktif (default) / nonaktif / semua
export const EMPLOYEE_ACTIVITY_FILTERS = ["active", "inactive", "all"] as const;
export type EmployeeActivityFilter = (typeof EMPLOYEE_ACTIVITY_FILTERS)[number];

// Bagian data sensitif yang bisa dibuka satu per satu
export const SENSITIVE_SECTIONS = ["tax", "bank"] as const;
export type SensitiveSection = (typeof SENSITIVE_SECTIONS)[number];

export const EMPLOYEES_PAGE_SIZE = 20;

// Bank tujuan transfer gaji yang umum dipakai UMKM. Kode disimpan di DB; nama untuk tampilan.
export const BANKS = [
  { code: "BCA", name: "Bank Central Asia" },
  { code: "BRI", name: "Bank Rakyat Indonesia" },
  { code: "BNI", name: "Bank Negara Indonesia" },
  { code: "MANDIRI", name: "Bank Mandiri" },
  { code: "BSI", name: "Bank Syariah Indonesia" },
  { code: "BTN", name: "Bank Tabungan Negara" },
  { code: "CIMB", name: "CIMB Niaga" },
  { code: "PERMATA", name: "Bank Permata" },
  { code: "DANAMON", name: "Bank Danamon" },
  { code: "OCBC", name: "OCBC Indonesia" },
  { code: "MAYBANK", name: "Maybank Indonesia" },
  { code: "PANIN", name: "Panin Bank" },
  { code: "MEGA", name: "Bank Mega" },
  { code: "BTPN", name: "SMBC Indonesia (Jenius/BTPN)" },
  { code: "JAGO", name: "Bank Jago" },
  { code: "SEABANK", name: "SeaBank Indonesia" },
  { code: "BJB", name: "Bank BJB (Jawa Barat & Banten)" },
  { code: "JATENG", name: "Bank Jateng" },
  { code: "JATIM", name: "Bank Jatim" },
  { code: "DKI", name: "Bank DKI" },
  { code: "SULSELBAR", name: "Bank Sulselbar" },
  { code: "BPD_BALI", name: "Bank BPD Bali" },
  { code: "SUMUT", name: "Bank Sumut" },
  { code: "KALTIMTARA", name: "Bankaltimtara" },
] as const;
export type BankCode = (typeof BANKS)[number]["code"];
const BANK_CODES = BANKS.map((bank) => bank.code) as [BankCode, ...BankCode[]];

export function bankName(code: string): string {
  return BANKS.find((bank) => bank.code === code)?.name ?? code;
}

// Tanggal tanpa jam, format ISO (YYYY-MM-DD)
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const dateSchema = (message: string) =>
  z
    .string(message)
    .regex(ISO_DATE, message)
    .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)), message);

// Teks kosong → null (kolom opsional)
const optionalText = (max: number, message: string) =>
  z
    .string()
    .trim()
    .max(max, message)
    .nullable()
    .transform((value) => (value ? value : null));

const optionalDate = (message: string) =>
  z
    .string()
    .nullable()
    .transform((value) => (value ? value : null))
    .pipe(dateSchema(message).nullable());

// Angka yang boleh diketik dengan spasi/titik/tanda hubung — disimpan hanya digit. Kosong → null.
const digits = (pattern: RegExp, message: string) =>
  z
    .string()
    .nullable()
    .transform((value) => (value ? value.replace(/[\s.-]/g, "") : null))
    .refine((value) => value === null || pattern.test(value), message);

// Form tambah & ubah karyawan. Pada UBAH: nik/npwp/bankAccountNumber bernilai null = tidak diubah.
export const employeeInputSchema = z
  .object({
    fullName: z.string().trim().min(2, "Nama lengkap wajib diisi").max(120, "Nama maksimal 120 karakter"),
    employeeNumber: optionalText(30, "Nomor induk maksimal 30 karakter"),
    email: z
      .string()
      .trim()
      .nullable()
      .transform((value) => (value ? value.toLowerCase() : null))
      .pipe(z.email("Format email tidak valid").max(254).nullable()),
    phone: z
      .string()
      .nullable()
      .transform((value) => (value ? value.replace(/[\s.-]/g, "") : null))
      .refine((value) => value === null || /^\+?[0-9]{8,15}$/.test(value), "Nomor HP 8–15 digit"),
    birthDate: optionalDate("Tanggal lahir tidak valid"),
    gender: z.enum(GENDERS).nullable(),
    departmentId: z.uuid("Pilih departemen"),
    positionId: z.uuid("Pilih jabatan"),
    supervisorId: z.uuid().nullable(),
    joinDate: dateSchema("Tanggal masuk wajib diisi"),
    employmentStatus: z.enum(EMPLOYMENT_STATUSES, "Pilih status kerja"),
    contractEndDate: optionalDate("Tanggal akhir kontrak tidak valid"),
    probationEndDate: optionalDate("Tanggal akhir percobaan tidak valid"),
    nik: digits(/^[0-9]{16}$/, "NIK harus 16 digit"),
    npwp: digits(/^[0-9]{15,16}$/, "NPWP harus 15 atau 16 digit"),
    ptkpStatus: z.enum(PTKP_STATUSES, "Pilih status PTKP"),
    bankCode: z.enum(BANK_CODES, "Pilih bank").nullable(),
    bankAccountNumber: digits(/^[0-9]{5,20}$/, "Nomor rekening 5–20 digit angka"),
    bankAccountHolder: optionalText(120, "Nama pemilik rekening maksimal 120 karakter"),
    userId: z.uuid().nullable(),
  })
  .superRefine((value, ctx) => {
    if (value.bankAccountNumber && !value.bankCode) ctx.addIssue({ code: "custom", path: ["bankCode"], message: "Pilih bank untuk nomor rekening ini" });
    if (value.employmentStatus === "contract") {
      if (!value.contractEndDate) ctx.addIssue({ code: "custom", path: ["contractEndDate"], message: "Tanggal akhir kontrak wajib diisi" });
      else if (value.contractEndDate < value.joinDate)
        ctx.addIssue({ code: "custom", path: ["contractEndDate"], message: "Tanggal akhir kontrak tidak boleh sebelum tanggal masuk" });
    }
    if (value.employmentStatus === "probation") {
      if (!value.probationEndDate) ctx.addIssue({ code: "custom", path: ["probationEndDate"], message: "Tanggal akhir percobaan wajib diisi" });
      else if (value.probationEndDate < value.joinDate)
        ctx.addIssue({ code: "custom", path: ["probationEndDate"], message: "Tanggal akhir percobaan tidak boleh sebelum tanggal masuk" });
    }
  })
  // Tanggal akhir hanya relevan untuk status yang sesuai
  .transform((value) => ({
    ...value,
    contractEndDate: value.employmentStatus === "contract" ? value.contractEndDate : null,
    probationEndDate: value.employmentStatus === "probation" ? value.probationEndDate : null,
  }));
export type EmployeeFormInput = z.input<typeof employeeInputSchema>;
export type EmployeeInput = z.output<typeof employeeInputSchema>;

export const deactivateEmployeeSchema = z.object({
  endDate: dateSchema("Tanggal keluar wajib diisi"),
  endReason: optionalText(500, "Alasan maksimal 500 karakter"),
});
export type DeactivateEmployeeFormInput = z.input<typeof deactivateEmployeeSchema>;
export type DeactivateEmployeeInput = z.output<typeof deactivateEmployeeSchema>;

export const revealSensitiveSchema = z.object({ section: z.enum(SENSITIVE_SECTIONS) });
export type RevealSensitiveInput = z.infer<typeof revealSensitiveSchema>;

export const employeeListQuerySchema = z.object({
  q: z.string().trim().max(100).catch(""),
  departmentId: z.uuid().nullable().catch(null),
  status: z.enum(EMPLOYMENT_STATUSES).nullable().catch(null),
  activity: z.enum(EMPLOYEE_ACTIVITY_FILTERS).catch("active"),
  page: z.coerce.number().int().min(1).catch(1),
});
export type EmployeeListQuery = z.infer<typeof employeeListQuerySchema>;

type Ref = { id: string; name: string };

export type EmployeeListItem = {
  id: string;
  fullName: string;
  employeeNumber: string | null;
  department: Ref;
  position: Ref;
  supervisor: { id: string; fullName: string } | null;
  employmentStatus: EmploymentStatus;
  joinDate: string;
  contractEndDate: string | null;
  probationEndDate: string | null;
  // Terisi = nonaktif (tanggal keluar)
  endDate: string | null;
};

export type EmployeeList = {
  items: EmployeeListItem[];
  total: number;
  page: number;
  pageSize: number;
  // Jumlah dalam cakupan penglihat (semua karyawan / bawahan langsung), tanpa filter
  counts: { active: number; inactive: number };
  // all = owner/admin; subordinates = atasan (hanya bawahan langsung, hanya baca)
  scope: "all" | "subordinates";
};

// Pilihan untuk form: departemen, jabatan, calon atasan, akun anggota usaha yang belum tertaut
export type EmployeeFormOptions = {
  departments: Ref[];
  positions: Ref[];
  supervisors: { id: string; fullName: string; positionName: string }[];
  users: { id: string; fullName: string; email: string }[];
};

export type EmployeeConfidential = {
  ptkpStatus: PtkpStatus;
  nikMasked: string | null;
  npwpMasked: string | null;
  bankCode: BankCode | null;
  bankAccountMasked: string | null;
  bankAccountHolder: string | null;
};

export type EmployeeDetail = EmployeeListItem & {
  email: string | null;
  phone: string | null;
  birthDate: string | null;
  gender: Gender | null;
  endReason: string | null;
  userAccount: { id: string; email: string } | null;
  // null untuk atasan: data pajak & rekening tidak dikirim sama sekali
  confidential: EmployeeConfidential | null;
  canManage: boolean;
  updatedAt: string;
};

export type RevealedSensitive =
  | { section: "tax"; nik: string | null; npwp: string | null; revealedAt: string; revealedBy: string }
  | { section: "bank"; bankAccountNumber: string | null; revealedAt: string; revealedBy: string };

// ——— Validasi respons API di web ———

const refSchema = z.object({ id: z.string(), name: z.string() });

const employeeListItemShape = {
  id: z.string(),
  fullName: z.string(),
  employeeNumber: z.string().nullable(),
  department: refSchema,
  position: refSchema,
  supervisor: z.object({ id: z.string(), fullName: z.string() }).nullable(),
  employmentStatus: z.enum(EMPLOYMENT_STATUSES),
  joinDate: z.string(),
  contractEndDate: z.string().nullable(),
  probationEndDate: z.string().nullable(),
  endDate: z.string().nullable(),
};

export const employeeListSchema: z.ZodType<EmployeeList> = z.object({
  items: z.array(z.object(employeeListItemShape)),
  total: z.number(),
  page: z.number(),
  pageSize: z.number(),
  counts: z.object({ active: z.number(), inactive: z.number() }),
  scope: z.enum(["all", "subordinates"]),
});

export const employeeFormOptionsSchema: z.ZodType<EmployeeFormOptions> = z.object({
  departments: z.array(refSchema),
  positions: z.array(refSchema),
  supervisors: z.array(z.object({ id: z.string(), fullName: z.string(), positionName: z.string() })),
  users: z.array(z.object({ id: z.string(), fullName: z.string(), email: z.string() })),
});

export const employeeDetailSchema: z.ZodType<EmployeeDetail> = z.object({
  ...employeeListItemShape,
  email: z.string().nullable(),
  phone: z.string().nullable(),
  birthDate: z.string().nullable(),
  gender: z.enum(GENDERS).nullable(),
  endReason: z.string().nullable(),
  userAccount: z.object({ id: z.string(), email: z.string() }).nullable(),
  confidential: z
    .object({
      ptkpStatus: z.enum(PTKP_STATUSES),
      nikMasked: z.string().nullable(),
      npwpMasked: z.string().nullable(),
      bankCode: z.enum(BANK_CODES).nullable(),
      bankAccountMasked: z.string().nullable(),
      bankAccountHolder: z.string().nullable(),
    })
    .nullable(),
  canManage: z.boolean(),
  updatedAt: z.string(),
});

export const revealedSensitiveSchema: z.ZodType<RevealedSensitive> = z.discriminatedUnion("section", [
  z.object({ section: z.literal("tax"), nik: z.string().nullable(), npwp: z.string().nullable(), revealedAt: z.string(), revealedBy: z.string() }),
  z.object({ section: z.literal("bank"), bankAccountNumber: z.string().nullable(), revealedAt: z.string(), revealedBy: z.string() }),
]);

// ——— Tampilan nilai sensitif ———

const DOT = "•";

// NIK: 4 digit kode wilayah + 4 digit akhir → "7371 •••• •••• 0004"
export function maskNik(nik: string): string {
  return `${nik.slice(0, 4)} ${DOT.repeat(4)} ${DOT.repeat(4)} ${nik.slice(-4)}`;
}

// NPWP: hanya 3 digit akhir; 15 digit mengikuti pola 00.000.000.0-000.000
export function maskNpwp(npwp: string): string {
  if (npwp.length === 15) return `${DOT.repeat(2)}.${DOT.repeat(3)}.${DOT.repeat(3)}.${DOT}-${DOT.repeat(3)}.${npwp.slice(-3)}`;
  return `${DOT.repeat(4)} ${DOT.repeat(4)} ${DOT.repeat(4)} ${DOT}${npwp.slice(-3)}`;
}

// Rekening: 4 digit akhir → "•••• •••• 4821"
export function maskBankAccount(account: string): string {
  return `${DOT.repeat(4)} ${DOT.repeat(4)} ${account.slice(-4)}`;
}

// Nilai penuh yang mudah dibaca
export function formatNik(nik: string): string {
  return nik.replace(/(\d{4})(?=\d)/g, "$1 ");
}

export function formatBankAccount(account: string): string {
  return account.replace(/(\d{4})(?=\d)/g, "$1 ");
}

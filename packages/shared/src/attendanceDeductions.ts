import { z } from "zod";

import { attendanceMonthSchema } from "./attendance.js";
import { moneySchema, positiveMoneySchema } from "./money.js";
import { isoDateSchema } from "./workCalendar.js";

// Aturan potongan absensi (feature 17, /settings/attendance): aturan terstruktur per usaha, berversi dengan tanggal berlaku.
// Simpan = versi baru (tanggal berlaku ≥ hari ini); versi sebelumnya ditutup sehari sebelumnya, versi terjadwal yang
// tertimpa dihapus. Dihitung oleh payroll-engine (calculateAttendanceDeduction) — dipakai payroll di feature 27.

// Alpa (tidak hadir tanpa izin)
export const ABSENCE_DEDUCTION_MODES = ["none", "prorate", "fixed_per_day"] as const;
export type AbsenceDeductionMode = (typeof ABSENCE_DEDUCTION_MODES)[number];
// Dasar prorata: gaji pokok atau gaji pokok + tunjangan tetap
export const PRORATE_BASES = ["base_salary", "base_and_fixed_allowances"] as const;
export type ProrateBase = (typeof PRORATE_BASES)[number];
// Pembagi prorata: hari kerja aktual periode (kalender kerja) atau angka tetap
export const WORKING_DAY_DIVISOR_MODES = ["actual", "fixed"] as const;
export type WorkingDayDivisorMode = (typeof WORKING_DAY_DIVISOR_MODES)[number];
// Telat
export const LATE_DEDUCTION_MODES = ["none", "per_occurrence", "per_block"] as const;
export type LateDeductionMode = (typeof LATE_DEDUCTION_MODES)[number];
// Izin & sakit (cuti tidak pernah dipotong)
export const PERMIT_SICK_DEDUCTION_MODES = ["none", "without_document", "after_days"] as const;
export type PermitSickDeductionMode = (typeof PERMIT_SICK_DEDUCTION_MODES)[number];
// Tunjangan kehadiran
export const ATTENDANCE_ALLOWANCE_MODES = ["none", "forfeit", "reduce_per_day"] as const;
export type AttendanceAllowanceMode = (typeof ATTENDANCE_ALLOWANCE_MODES)[number];

export const LATE_TOLERANCE_MAX = 240;
export const LATE_BLOCK_MAX = 240;
export const DIVISOR_DAYS_MAX = 31;
export const RULE_DAYS_MAX = 31;

const minutes = (max: number, min: number) =>
  z.number("Wajib diisi").int("Harus bilangan bulat").min(min, `Minimal ${min}`).max(max, `Maksimal ${max}`);

const divisorSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("actual") }),
  z.object({ mode: z.literal("fixed"), days: minutes(DIVISOR_DAYS_MAX, 1) }),
]);

const absenceSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("none") }),
  z.object({ mode: z.literal("prorate"), base: z.enum(PRORATE_BASES), divisor: divisorSchema }),
  z.object({ mode: z.literal("fixed_per_day"), amountPerDay: positiveMoneySchema }),
]);

// Toleransi: telat ≤ N menit tidak dihitung. Lewat toleransi → seluruh menit telat (sejak jam masuk jadwal) dihitung.
// Batas per bulan: total potongan telat satu periode payroll tidak melebihi nominal ini (null = tanpa batas).
const lateSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("none") }),
  z.object({
    mode: z.literal("per_occurrence"),
    toleranceMinutes: minutes(LATE_TOLERANCE_MAX, 0),
    amountPerOccurrence: positiveMoneySchema,
    monthlyCap: positiveMoneySchema.nullable(),
  }),
  z.object({
    mode: z.literal("per_block"),
    toleranceMinutes: minutes(LATE_TOLERANCE_MAX, 0),
    blockMinutes: minutes(LATE_BLOCK_MAX, 1),
    amountPerBlock: positiveMoneySchema,
    monthlyCap: positiveMoneySchema.nullable(),
  }),
]);

// Hari izin/sakit yang dipotong dinilai sama dengan satu hari alpa (nilai per hari dari aturan alpa).
// without_document = pengajuan disetujui tanpa lampiran; after_days = hari izin + sakit di atas N hari per periode.
const permitSickSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("none") }),
  z.object({ mode: z.literal("without_document") }),
  z.object({ mode: z.literal("after_days"), freeDays: minutes(RULE_DAYS_MAX, 0) }),
]);

const attendanceAllowanceSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("none") }),
  z.object({ mode: z.literal("forfeit"), minAbsentDays: minutes(RULE_DAYS_MAX, 1) }),
  z.object({ mode: z.literal("reduce_per_day"), amountPerDay: positiveMoneySchema }),
]);

export const attendanceDeductionRulesSchema = z
  .object({
    absence: absenceSchema,
    late: lateSchema,
    permitSick: permitSickSchema,
    attendanceAllowance: attendanceAllowanceSchema,
  })
  .refine((rules) => rules.permitSick.mode === "none" || rules.absence.mode !== "none", {
    path: ["permitSick", "mode"],
    message: "Potongan izin/sakit memakai nilai per hari dari aturan alpa — pilih cara potong alpa terlebih dahulu",
  });
export type AttendanceDeductionRules = z.infer<typeof attendanceDeductionRulesSchema>;

// Belum ada versi sama sekali = tidak ada potongan (semua "none")
export const NO_ATTENDANCE_DEDUCTION_RULES: AttendanceDeductionRules = {
  absence: { mode: "none" },
  late: { mode: "none" },
  permitSick: { mode: "none" },
  attendanceAllowance: { mode: "none" },
};

export const saveAttendanceDeductionRulesSchema = z.object({
  // Hari ini (zona waktu usaha) atau setelahnya — dicek di API
  effectiveFrom: isoDateSchema,
  rules: attendanceDeductionRulesSchema,
});
export type SaveAttendanceDeductionRulesInput = z.infer<typeof saveAttendanceDeductionRulesSchema>;

// active = berlaku hari ini · scheduled = mulai berlaku nanti · ended = sudah digantikan
export const DEDUCTION_RULE_VERSION_STATUSES = ["active", "scheduled", "ended"] as const;
export type DeductionRuleVersionStatus = (typeof DEDUCTION_RULE_VERSION_STATUSES)[number];

export const attendanceDeductionRuleVersionSchema = z.object({
  id: z.string(),
  effectiveFrom: z.string(),
  effectiveTo: z.string().nullable(),
  status: z.enum(DEDUCTION_RULE_VERSION_STATUSES),
  rules: attendanceDeductionRulesSchema,
  createdByName: z.string().nullable(),
  createdAt: z.string(),
});
export type AttendanceDeductionRuleVersion = z.infer<typeof attendanceDeductionRuleVersionSchema>;

export const attendanceDeductionSettingsSchema = z.object({
  // Tanggal hari ini di zona waktu usaha — batas awal tanggal berlaku versi baru
  today: z.string(),
  // Terbaru di atas (tanggal berlaku menurun)
  versions: z.array(attendanceDeductionRuleVersionSchema),
});
export type AttendanceDeductionSettings = z.infer<typeof attendanceDeductionSettingsSchema>;

// ——— Pratinjau: rekap absensi nyata satu karyawan + gaji diisi manual (komponen gaji baru ada di feature 28) ———

export const attendanceDeductionPreviewInputSchema = z.object({
  employeeId: z.uuid("Pilih karyawan"),
  month: attendanceMonthSchema,
  baseSalary: positiveMoneySchema,
  fixedAllowances: moneySchema,
  attendanceAllowance: moneySchema,
  rules: attendanceDeductionRulesSchema,
});
export type AttendanceDeductionPreviewInput = z.infer<typeof attendanceDeductionPreviewInputSchema>;

export const ATTENDANCE_DEDUCTION_LINE_KINDS = ["absence", "permit_sick", "late", "attendance_allowance"] as const;
export type AttendanceDeductionLineKind = (typeof ATTENDANCE_DEDUCTION_LINE_KINDS)[number];

export const attendanceDeductionLineSchema = z.object({
  kind: z.enum(ATTENDANCE_DEDUCTION_LINE_KINDS),
  // Rupiah bulat, string "681818.00"
  amount: z.string(),
  // Langkah perhitungan yang bisa dibaca karyawan (dipakai ulang di slip gaji)
  steps: z.array(z.string()),
});
export type AttendanceDeductionLine = z.infer<typeof attendanceDeductionLineSchema>;

export const attendanceDeductionResultSchema = z.object({
  // Hanya aturan yang aktif (mode ≠ none), urutan tetap: alpa, izin/sakit, telat, tunjangan kehadiran
  lines: z.array(attendanceDeductionLineSchema),
  // Potongan gaji (alpa + izin/sakit + telat)
  totalDeduction: z.string(),
  // Tunjangan kehadiran yang tetap dibayar setelah dikurangi
  attendanceAllowancePaid: z.string(),
});
export type AttendanceDeductionResult = z.infer<typeof attendanceDeductionResultSchema>;

export const attendanceDeductionFactsSchema = z.object({
  // Hari kerja kalender dalam periode (pembagi aktual) — tanpa memperhitungkan masa kerja karyawan
  periodWorkingDays: z.number().int(),
  absentDays: z.number().int(),
  // Menit telat per kejadian (hari kerja dengan absen telat)
  lateMinutes: z.array(z.number().int()),
  permitDays: z.number().int(),
  sickDays: z.number().int(),
  // Hari izin/sakit disetujui yang pengajuannya tanpa lampiran
  undocumentedPermitSickDays: z.number().int(),
});
export type AttendanceDeductionFacts = z.infer<typeof attendanceDeductionFactsSchema>;

export const attendanceDeductionPreviewSchema = z.object({
  employee: z.object({ id: z.string(), fullName: z.string(), positionName: z.string() }),
  from: z.string(),
  to: z.string(),
  today: z.string(),
  facts: attendanceDeductionFactsSchema,
  result: attendanceDeductionResultSchema,
});
export type AttendanceDeductionPreview = z.infer<typeof attendanceDeductionPreviewSchema>;

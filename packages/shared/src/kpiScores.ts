import { z } from "zod";

import { ATTENDANCE_ACCESS } from "./attendance.js";
import { attendancePeriodQuerySchema } from "./attendanceRecap.js";
import { KPI_INDICATOR_TYPES, KPI_SYSTEM_METRICS, KPI_TARGET_PERIODS } from "./kpiTemplates.js";

// Skor KPI ad-hoc (feature 21): /kpi/scores (owner/admin semua karyawan, atasan bawahan langsung) & /me/performance (milik sendiri).
// Dihitung saat dibaca dari template KPI jabatan saat ini + catatan tugas terverifikasi + rekap absensi — tidak disimpan.
//
// Rumus (fungsi murni apps/api/src/modules/kpi/kpi-score.ts):
// - Hari target = hari kerja dalam periode ∩ masa kerja, dikurangi izin/sakit/cuti disetujui; dihitung sampai hari ini
// - Target angka/jumlah diprorata per hari target: harian × 1 · mingguan ÷ hari kerja per minggu · bulanan ÷ hari kerja bulan itu
// - Kehadiran = hadir ÷ (hadir + alpa); hari ini tanpa absen belum dihitung
// - Capaian = realisasi ÷ target (maks. 120%, 1 desimal); poin = capaian × bobot
// - Indikator penilaian atasan hanya dihitung jika sudah dinilai; indikator tanpa hari target/kehadiran juga dilewati —
//   bobotnya dikeluarkan dari pembagi: skor = Σ poin ÷ Σ bobot dihitung × 100, maks. 100, 1 desimal

export const KPI_ACHIEVEMENT_CAP = 120;
export const KPI_SCORE_MAX = 100;

export const KPI_PREDICATES = ["very_good", "good", "fair", "needs_improvement"] as const;
export type KpiPredicate = (typeof KPI_PREDICATES)[number];

export const KPI_PREDICATE_LABELS: Record<KpiPredicate, string> = {
  very_good: "Sangat Baik",
  good: "Baik",
  fair: "Cukup",
  needs_improvement: "Perlu Perbaikan",
};

// Batas bawah skor tiap predikat (≥90 Sangat Baik, 75–89 Baik, 60–74 Cukup, <60 Perlu Perbaikan)
export const KPI_PREDICATE_MIN: Record<Exclude<KpiPredicate, "needs_improvement">, number> = { very_good: 90, good: 75, fair: 60 };

// scored = masuk skor · not_rated = penilaian atasan belum ada · not_applicable = tidak ada hari target / hari kehadiran di periode
export const KPI_INDICATOR_SCORE_STATUSES = ["scored", "not_rated", "not_applicable"] as const;
export type KpiIndicatorScoreStatus = (typeof KPI_INDICATOR_SCORE_STATUSES)[number];

// Periode seperti rekap absensi (bulan / rentang bebas maks. 92 hari) + filter departemen (tim)
export const kpiScoreQuerySchema = attendancePeriodQuerySchema.safeExtend({
  departmentId: z.uuid().optional().catch(undefined),
});
export type KpiScoreQuery = z.infer<typeof kpiScoreQuerySchema>;

// Semua angka berupa string desimal tanpa nol di belakang — tidak pernah float
export const kpiIndicatorScoreSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(KPI_INDICATOR_TYPES),
  unit: z.string().nullable(),
  targetPeriod: z.enum(KPI_TARGET_PERIODS).nullable(),
  systemMetric: z.enum(KPI_SYSTEM_METRICS).nullable(),
  weight: z.number().int(),
  // Target di template (per hari/minggu/bulan; persen untuk kehadiran; skala maks. untuk penilaian)
  target: z.string(),
  // Target untuk periode ini: angka/jumlah = hasil prorata (2 desimal); kehadiran = persen; penilaian = skala maks.
  periodTarget: z.string(),
  // Realisasi terverifikasi / persen kehadiran (1 desimal) / nilai penilaian; null = belum ada
  actual: z.string().nullable(),
  // Persen capaian (maks. 120), null jika tidak dihitung
  achievement: z.string().nullable(),
  // capaian × bobot ÷ 100
  points: z.string().nullable(),
  status: z.enum(KPI_INDICATOR_SCORE_STATUSES),
});
export type KpiIndicatorScore = z.infer<typeof kpiIndicatorScoreSchema>;

export const kpiScoreDaysSchema = z.object({
  // Hari kerja ∩ masa kerja − izin/sakit/cuti (dasar prorata target)
  targetDays: z.number().int(),
  present: z.number().int(),
  absent: z.number().int(),
  // Izin + sakit + cuti disetujui di hari kerja
  leaveDays: z.number().int(),
});
export type KpiScoreDays = z.infer<typeof kpiScoreDaysSchema>;

export const kpiScoreResultSchema = z.object({
  // null = belum ada indikator yang bisa dihitung
  score: z.string().nullable(),
  predicate: z.enum(KPI_PREDICATES).nullable(),
  // Σ poin indikator yang masuk skor
  pointTotal: z.string(),
  // Σ bobot indikator yang masuk skor (pembagi)
  countedWeight: z.number().int(),
  days: kpiScoreDaysSchema,
  indicators: z.array(kpiIndicatorScoreSchema),
});
export type KpiScoreResult = z.infer<typeof kpiScoreResultSchema>;

const scoreEmployeeSchema = z.object({
  id: z.string(),
  fullName: z.string(),
  positionName: z.string(),
  departmentId: z.string(),
  departmentName: z.string(),
  endDate: z.string().nullable(),
});

const templateRefSchema = z.object({ id: z.string(), name: z.string() });

export const kpiScoreRowSchema = z.object({
  employee: scoreEmployeeSchema,
  // null = jabatan belum memakai template KPI (result juga null)
  template: templateRefSchema.nullable(),
  result: kpiScoreResultSchema.nullable(),
});
export type KpiScoreRow = z.infer<typeof kpiScoreRowSchema>;

export const kpiScoreListSchema = z.object({
  from: z.string(),
  // Tanggal akhir yang dihitung (tanggal akhir periode, maks. hari ini)
  to: z.string(),
  // Tanggal akhir yang diminta (bisa setelah hari ini untuk bulan berjalan)
  requestedTo: z.string(),
  today: z.string(),
  scope: z.enum(["all", "subordinates"]),
  departmentId: z.string().nullable(),
  // Departemen karyawan yang terlihat di periode ini (pilihan filter tim)
  departments: z.array(z.object({ id: z.string(), name: z.string() })),
  // Rata-rata skor karyawan yang punya skor (1 desimal); null jika belum ada
  averageScore: z.string().nullable(),
  averagePredicate: z.enum(KPI_PREDICATES).nullable(),
  predicateCounts: z.object({ very_good: z.number().int(), good: z.number().int(), fair: z.number().int(), needs_improvement: z.number().int() }),
  rows: z.array(kpiScoreRowSchema),
});
export type KpiScoreList = z.infer<typeof kpiScoreListSchema>;

export const myKpiScoreSchema = z.object({
  // Sama dengan akses portal absensi: not_linked = akun belum tertaut data karyawan
  access: z.enum(ATTENDANCE_ACCESS),
  month: z.string(),
  currentMonth: z.string(),
  from: z.string(),
  to: z.string(),
  today: z.string(),
  template: templateRefSchema.nullable(),
  result: kpiScoreResultSchema.nullable(),
});
export type MyKpiScore = z.infer<typeof myKpiScoreSchema>;

// Skor satu karyawan per bulan kalender — tab KPI detail karyawan /employees/[id] (feature 37b). Rumus & periode sama dengan
// skor milik sendiri (bulan berjalan s.d. hari ini). Cakupan: owner/admin semua, atasan bawahan langsung.
export const employeeKpiScoreSchema = myKpiScoreSchema.omit({ access: true });
export type EmployeeKpiScore = z.infer<typeof employeeKpiScoreSchema>;

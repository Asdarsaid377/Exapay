import { z } from "zod";

import { complianceReminderSchema } from "./compliance.js";
import { KPI_PREDICATES } from "./kpiScores.js";
import { minimumWageSummarySchema } from "./minimumWage.js";
import { payrollRunPeriodSchema } from "./payrollRuns.js";

// Dashboard owner/admin (feature 35) & atasan (feature 36): ringkasan yang angkanya diambil dari service halaman sumbernya
// (rekap absensi, skor KPI, periode gaji, kalender kepatuhan, verifikasi tugas, pengajuan izin, penilaian).

export const attendanceDailyCountSchema = z.object({
  date: z.string(),
  // Karyawan yang tanggal itu hari kerja & dalam masa kerja
  expected: z.number().int(),
  onTime: z.number().int(),
  late: z.number().int(),
  // Izin + sakit + cuti disetujui
  leave: z.number().int(),
  absent: z.number().int(),
  // Hari kerja hari ini/mendatang yang belum absen
  pending: z.number().int(),
});
export type AttendanceDailyCount = z.infer<typeof attendanceDailyCountSchema>;

// Rekap harian periode absensi berjalan (tutup buku, sama dengan default /attendance)
export const attendanceDailyRecapSchema = z.object({
  month: z.string(),
  from: z.string(),
  to: z.string(),
  today: z.string(),
  // Karyawan yang masa kerjanya beririsan dengan periode (= baris /attendance)
  employeeCount: z.number().int(),
  days: z.array(attendanceDailyCountSchema),
  // Sama dengan total halaman rekap: hadir termasuk telat
  totals: z.object({ present: z.number().int(), late: z.number().int(), leave: z.number().int(), absent: z.number().int() }),
});
export type AttendanceDailyRecap = z.infer<typeof attendanceDailyRecapSchema>;

// Skor KPI ad-hoc bulan berjalan (= default /kpi/scores, cakupan sesuai peran)
export const dashboardKpiSchema = z.object({
  from: z.string(),
  to: z.string(),
  scoredCount: z.number().int(),
  averageScore: z.string().nullable(),
  averagePredicate: z.enum(KPI_PREDICATES).nullable(),
  predicateCounts: z.object({ very_good: z.number().int(), good: z.number().int(), fair: z.number().int(), needs_improvement: z.number().int() }),
});

// = jumlah tab Menunggu /kpi/verification
const pendingTaskLogsSchema = z.object({ count: z.number().int(), oldestWorkDate: z.string().nullable() });
// = jumlah tab Menunggu /attendance/requests
const pendingLeaveRequestsSchema = z.object({ count: z.number().int(), permit: z.number().int(), sick: z.number().int(), leave: z.number().int() });

export const ownerDashboardSchema = z.object({
  today: z.string(),
  attendance: attendanceDailyRecapSchema,
  // Karyawan aktif (= tab Aktif /employees) per status kerja
  employees: z.object({
    active: z.number().int(),
    permanent: z.number().int(),
    contract: z.number().int(),
    probation: z.number().int(),
  }),
  // Periode gaji terbaru yang sudah dibuka; null = belum ada periode
  payroll: z
    .object({
      run: payrollRunPeriodSchema,
      employeeCount: z.number().int(),
      grossPay: z.string(),
      bpjsEmployer: z.string(),
      // Biaya usaha = bruto + iuran BPJS perusahaan
      cost: z.string(),
    })
    .nullable(),
  kpi: dashboardKpiSchema,
  pending: z.object({
    taskLogs: pendingTaskLogsSchema,
    leaveRequests: pendingLeaveRequestsSchema,
    // Penilaian periodik terkirim (reviewed) yang menunggu difinalkan owner/admin
    kpiReviews: z.object({ count: z.number().int() }),
    // Periode gaji draf, terlama dulu
    payrollDrafts: z.array(payrollRunPeriodSchema.pick({ id: true, month: true, periodStart: true, periodEnd: true })),
  }),
  compliance: z.object({
    overdue: z.number().int(),
    // Belum selesai: terlewat dulu, lalu tenggat terdekat (maks. DASHBOARD_REMINDER_LIMIT)
    reminders: z.array(complianceReminderSchema),
  }),
  minimumWage: minimumWageSummarySchema,
});
export type OwnerDashboard = z.infer<typeof ownerDashboardSchema>;

// Dashboard atasan (feature 36, GET /dashboard/team): hanya bawahan langsung (supervisor_id = data karyawan atasan).
export const supervisorDashboardSchema = z.object({
  today: z.string(),
  // false = akun atasan belum tertaut data karyawan → tidak punya bawahan
  linked: z.boolean(),
  // Bawahan langsung aktif
  team: z.object({ active: z.number().int() }),
  attendance: attendanceDailyRecapSchema,
  kpi: dashboardKpiSchema,
  pending: z.object({
    taskLogs: pendingTaskLogsSchema,
    leaveRequests: pendingLeaveRequestsSchema,
    // Penilaian periodik draft bawahan yang perlu diisi atasan; periodId = periode terlama yang masih punya draft
    kpiReviews: z.object({ count: z.number().int(), periodId: z.string().nullable() }),
  }),
});
export type SupervisorDashboard = z.infer<typeof supervisorDashboardSchema>;

export const DASHBOARD_REMINDER_LIMIT = 4;
// Pengingat ditampilkan sampai sekian hari ke depan
export const DASHBOARD_REMINDER_DAYS = 45;

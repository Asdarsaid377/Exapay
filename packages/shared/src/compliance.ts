import { z } from "zod";

import type { EmploymentStatus } from "./employees.js";
import { isoDateSchema } from "./workCalendar.js";

// Kalender kepatuhan (feature 33). Pengingat DIHITUNG saat dibaca (tidak disimpan) dari:
// - tenggat berkala (setor BPJS, setor/lapor PPh 21) — aturan tanggal dari tabel regulasi `compliance_deadlines`
//   (berlaku-tanggal per masa), hanya untuk masa yang punya karyawan aktif;
// - data karyawan: tanggal akhir kontrak / masa percobaan.
// Fungsi murni di bawah dipakai bersama API (halaman /compliance) dan worker (email H-7/H-1) agar keduanya selalu sama.
// Tabel tenant `compliance_reminders` hanya menyimpan status "selesai" & jejak email per kunci pengingat.

export const COMPLIANCE_DEADLINE_KINDS = ["bpjs_kesehatan", "bpjs_ketenagakerjaan", "pph21_payment", "pph21_report"] as const;
export type ComplianceDeadlineKind = (typeof COMPLIANCE_DEADLINE_KINDS)[number];

export const COMPLIANCE_EMPLOYEE_KINDS = ["contract_end", "probation_end"] as const;
export type ComplianceEmployeeKind = (typeof COMPLIANCE_EMPLOYEE_KINDS)[number];

export const COMPLIANCE_REMINDER_KINDS = [...COMPLIANCE_DEADLINE_KINDS, ...COMPLIANCE_EMPLOYEE_KINDS] as const;
export type ComplianceReminderKind = (typeof COMPLIANCE_REMINDER_KINDS)[number];

export const COMPLIANCE_REMINDER_KIND_LABELS: Record<ComplianceReminderKind, string> = {
  bpjs_kesehatan: "Setor iuran BPJS Kesehatan",
  bpjs_ketenagakerjaan: "Setor iuran BPJS Ketenagakerjaan",
  pph21_payment: "Setor PPh 21",
  pph21_report: "Lapor SPT Masa PPh 21",
  contract_end: "Kontrak berakhir",
  probation_end: "Masa percobaan selesai",
};

// Email pengingat dikirim saat sisa hari ≤ 7 (H-7) lalu ≤ 1 (H-1) — masing-masing sekali per pengingat
export const COMPLIANCE_NOTICES = ["h7", "h1"] as const;
export type ComplianceNotice = (typeof COMPLIANCE_NOTICES)[number];
export const COMPLIANCE_NOTICE_DAYS: Record<ComplianceNotice, number> = { h7: 7, h1: 1 };

// Pengingat terlewat (belum ditandai selesai) dicari mundur maksimal 12 bulan
export const COMPLIANCE_OVERDUE_LOOKBACK_MONTHS = 12;

// ——— Generator (fungsi murni) ———

// Versi aturan tenggat: masa M → tanggal `dueDay` pada bulan M + monthOffset (bulan pendek → hari terakhirnya).
// Berlaku menurut tanggal 1 masa (effective_from/to inklusif).
export type ComplianceDeadlineRule = {
  kind: ComplianceDeadlineKind;
  dueDay: number;
  monthOffset: number;
  effectiveFrom: string;
  effectiveTo: string | null;
};

export type ComplianceEmployee = {
  id: string;
  fullName: string;
  employmentStatus: EmploymentStatus;
  joinDate: string;
  endDate: string | null;
  contractEndDate: string | null;
  probationEndDate: string | null;
};

export type ComplianceSource = {
  rules: readonly ComplianceDeadlineRule[];
  employees: readonly ComplianceEmployee[];
  // Tanggal usaha terdaftar di Exapay (YYYY-MM-DD) — tenggat sebelum tanggal ini tidak diingatkan
  since: string;
};

export type ComplianceReminderItem = {
  // bpjs_kesehatan:2026-09 · contract_end:<employee id>:2026-11-30
  key: string;
  kind: ComplianceReminderKind;
  dueDate: string;
  // Masa (YYYY-MM) untuk tenggat berkala
  periodMonth: string | null;
  employee: { id: string; fullName: string } | null;
};

const KIND_ORDER = new Map<ComplianceReminderKind, number>(COMPLIANCE_REMINDER_KINDS.map((kind, index) => [kind, index]));

// "2026-10" + n bulan
export function shiftComplianceMonth(month: string, months: number): string {
  const total = Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7)) - 1 + months;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

function lastDayOf(month: string): string {
  const days = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();
  return `${month}-${String(days).padStart(2, "0")}`;
}

function dayOf(month: string, day: number): string {
  const last = lastDayOf(month);
  return `${month}-${String(Math.min(day, Number(last.slice(8, 10)))).padStart(2, "0")}`;
}

// Selisih hari kalender to − from (YYYY-MM-DD)
export function complianceDaysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

function ruleFor(rules: readonly ComplianceDeadlineRule[], kind: ComplianceDeadlineKind, month: string): ComplianceDeadlineRule | null {
  const first = `${month}-01`;
  return rules.find((rule) => rule.kind === kind && rule.effectiveFrom <= first && (rule.effectiveTo === null || rule.effectiveTo >= first)) ?? null;
}

function hasActiveEmployee(employees: readonly ComplianceEmployee[], month: string): boolean {
  const first = `${month}-01`;
  const last = lastDayOf(month);
  return employees.some((employee) => employee.joinDate <= last && (employee.endDate === null || employee.endDate >= first));
}

function compareItems(a: ComplianceReminderItem, b: ComplianceReminderItem): number {
  if (a.dueDate !== b.dueDate) return a.dueDate < b.dueDate ? -1 : 1;
  const kind = (KIND_ORDER.get(a.kind) ?? 0) - (KIND_ORDER.get(b.kind) ?? 0);
  if (kind !== 0) return kind;
  return (a.employee?.fullName ?? a.periodMonth ?? "").localeCompare(b.employee?.fullName ?? b.periodMonth ?? "", "id");
}

// Semua pengingat dengan tenggat di [from, to] (inklusif) dan tidak sebelum usaha terdaftar, urut tanggal → jenis → nama/masa
export function complianceRemindersBetween(source: ComplianceSource, requestedFrom: string, to: string): ComplianceReminderItem[] {
  const from = requestedFrom < source.since ? source.since : requestedFrom;
  if (to < from) return [];
  const items: ComplianceReminderItem[] = [];

  const maxOffset = source.rules.reduce((max, rule) => Math.max(max, rule.monthOffset), 0);
  const lastMonth = to.slice(0, 7);
  for (let month = shiftComplianceMonth(from.slice(0, 7), -maxOffset); month <= lastMonth; month = shiftComplianceMonth(month, 1)) {
    if (!hasActiveEmployee(source.employees, month)) continue;
    for (const kind of COMPLIANCE_DEADLINE_KINDS) {
      const rule = ruleFor(source.rules, kind, month);
      if (!rule) continue;
      const dueDate = dayOf(shiftComplianceMonth(month, rule.monthOffset), rule.dueDay);
      if (dueDate < from || dueDate > to) continue;
      items.push({ key: `${kind}:${month}`, kind, dueDate, periodMonth: month, employee: null });
    }
  }

  for (const employee of source.employees) {
    const candidates: [ComplianceEmployeeKind, string | null][] = [
      ["contract_end", employee.employmentStatus === "contract" ? employee.contractEndDate : null],
      ["probation_end", employee.employmentStatus === "probation" ? employee.probationEndDate : null],
    ];
    for (const [kind, dueDate] of candidates) {
      // Karyawan yang sudah keluar pada/sebelum tanggal itu tidak perlu diingatkan
      if (dueDate === null || dueDate < from || dueDate > to || (employee.endDate !== null && employee.endDate <= dueDate)) continue;
      items.push({ key: `${kind}:${employee.id}:${dueDate}`, kind, dueDate, periodMonth: null, employee: { id: employee.id, fullName: employee.fullName } });
    }
  }

  return items.sort(compareItems);
}

// Pengingat untuk satu kunci — null bila kunci tidak (lagi) menunjuk pengingat yang berlaku (mis. tanggal kontrak diubah)
export function findComplianceReminder(source: ComplianceSource, key: string): ComplianceReminderItem | null {
  const parsed = complianceReminderKeySchema.safeParse(key);
  if (!parsed.success) return null;
  const [kind, ref, date] = parsed.data.split(":");
  let from: string;
  let to: string;
  if (date !== undefined) {
    from = date;
    to = date;
  } else {
    // Masa M: tenggatnya di bulan M … M + offset terbesar
    const month = ref ?? "";
    const maxOffset = source.rules.reduce((max, rule) => Math.max(max, rule.monthOffset), 0);
    from = `${month}-01`;
    to = lastDayOf(shiftComplianceMonth(month, maxOffset));
  }
  return complianceRemindersBetween(source, from, to).find((item) => item.key === key && item.kind === kind) ?? null;
}

// ——— Input & output API ———

const monthPattern = "[0-9]{4}-(0[1-9]|1[0-2])";
const uuidPattern = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

export const complianceReminderKeySchema = z
  .string()
  .regex(
    new RegExp(`^((${COMPLIANCE_DEADLINE_KINDS.join("|")}):${monthPattern}|(${COMPLIANCE_EMPLOYEE_KINDS.join("|")}):${uuidPattern}:[0-9]{4}-[0-9]{2}-[0-9]{2})$`),
    "Pengingat tidak valid",
  )
  .refine((key) => {
    const date = key.split(":")[2];
    return date === undefined || isoDateSchema.safeParse(date).success;
  }, "Pengingat tidak valid");

export const complianceMonthSchema = z.string().regex(new RegExp(`^${monthPattern}$`), "Bulan tidak valid");

export const complianceQuerySchema = z.object({ month: complianceMonthSchema.optional() });
export type ComplianceQuery = z.infer<typeof complianceQuerySchema>;

export const complianceReminderActionSchema = z.object({ key: complianceReminderKeySchema });
export type ComplianceReminderActionInput = z.infer<typeof complianceReminderActionSchema>;

export const COMPLIANCE_REMINDER_STATUSES = ["open", "done"] as const;
export type ComplianceReminderStatus = (typeof COMPLIANCE_REMINDER_STATUSES)[number];

export const complianceReminderSchema = z.object({
  key: z.string(),
  kind: z.enum(COMPLIANCE_REMINDER_KINDS),
  dueDate: z.string(),
  periodMonth: z.string().nullable(),
  employee: z.object({ id: z.string(), fullName: z.string() }).nullable(),
  // Tenggat − hari ini (zona waktu usaha); negatif = terlewat
  daysUntil: z.number().int(),
  status: z.enum(COMPLIANCE_REMINDER_STATUSES),
  doneAt: z.string().nullable(),
  doneByName: z.string().nullable(),
});
export type ComplianceReminder = z.infer<typeof complianceReminderSchema>;

export const complianceCalendarSchema = z.object({
  // Bulan yang ditampilkan & bulan berjalan (YYYY-MM), hari ini (YYYY-MM-DD) — zona waktu usaha
  month: z.string(),
  currentMonth: z.string(),
  today: z.string(),
  // Belum selesai & tenggat sebelum hari ini (lintas bulan, maks. 12 bulan ke belakang)
  overdue: z.array(complianceReminderSchema),
  // Semua pengingat dengan tenggat di bulan yang ditampilkan
  reminders: z.array(complianceReminderSchema),
  summary: z.object({
    overdue: z.number().int(),
    // Belum selesai, tenggat hari ini s.d. 7 hari ke depan
    dueThisWeek: z.number().int(),
    openThisMonth: z.number().int(),
    doneThisMonth: z.number().int(),
  }),
});
export type ComplianceCalendar = z.infer<typeof complianceCalendarSchema>;

// ——— Antrean BullMQ "compliance" (dijadwalkan & diproses apps/worker) ———

export const COMPLIANCE_QUEUE_NAME = "compliance";
// Harian: cari usaha aktif → satu job notify per usaha
export const COMPLIANCE_SCAN_JOB = "compliance-scan";
// Per usaha per tanggal: kirim email H-7/H-1 ke owner/admin
export const COMPLIANCE_NOTIFY_JOB = "compliance-notify";
export const complianceNotifyJobDataSchema = z.object({ tenantId: z.uuid() });
export type ComplianceNotifyJobData = z.infer<typeof complianceNotifyJobDataSchema>;

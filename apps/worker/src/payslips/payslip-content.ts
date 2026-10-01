import {
  type AttendanceDeductionLineKind,
  type BpjsProgram,
  formatRupiah,
  type PayrollEmployeeSnapshot,
  trimDecimal,
} from "@exapay/shared";
import { Decimal } from "decimal.js";

// Isi slip gaji (feature 31) dari snapshot payroll final — fungsi murni, tanpa I/O. Angka TIDAK dihitung ulang: semua
// nominal dari payroll-engine yang tersimpan saat final; di sini hanya disusun & dijumlah untuk tampilan, lalu dicek
// konsisten (bruto − total potongan = gaji diterima). Urutan mengikuti rincian draf (PayrollBreakdown di web).

// Sama dengan label web (lib/payrollRunLabels.ts, lib/attendanceDeductionLabels.ts)
const BPJS_LABELS: Record<BpjsProgram, string> = {
  kesehatan: "BPJS Kesehatan",
  jht: "BPJS TK - Jaminan Hari Tua",
  jp: "BPJS TK - Jaminan Pensiun",
  jkk: "BPJS TK - Jaminan Kecelakaan Kerja",
  jkm: "BPJS TK - Jaminan Kematian",
};
const ATTENDANCE_LABELS: Record<AttendanceDeductionLineKind, string> = {
  absence: "Potongan alpa",
  permit_sick: "Potongan izin & sakit",
  late: "Potongan telat",
  attendance_allowance: "Tunjangan kehadiran berkurang",
};

const DATE_FORMAT = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const MONTH_FORMAT = new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric", timeZone: "UTC" });

export type PayslipSource = {
  company: { name: string; address: string | null };
  period: {
    // "2026-10"
    month: string;
    // Rentang absensi (tutup buku)
    periodStart: string;
    periodEnd: string;
    payDate: string | null;
  };
  // Hanya status calculated
  employee: PayrollEmployeeSnapshot;
  // Tanggal dibuat (zona waktu usaha) — catatan kaki
  generatedOn: string;
};

export type PayslipLine = { label: string; note: string | null; amount: string };
export type PayslipSection = { title: string; lines: PayslipLine[]; totalLabel: string; total: string };

export type PayslipContent = {
  // "Oktober 2026"
  monthLabel: string;
  company: { name: string; address: string | null };
  details: { label: string; value: string }[];
  earnings: PayslipSection;
  deductions: PayslipSection;
  takeHomePay: string;
  // Iuran BPJS porsi perusahaan — informasi, tidak dipotong dari gaji
  employerContributions: { lines: PayslipLine[]; total: string } | null;
  notes: string[];
  footer: string;
};

export class PayslipContentError extends Error {}

export function formatIdDate(date: string): string {
  return DATE_FORMAT.format(new Date(`${date}T00:00:00Z`));
}

export function formatIdMonth(month: string): string {
  return MONTH_FORMAT.format(new Date(`${month}-01T00:00:00Z`));
}

function hasValue(amount: string): boolean {
  return /[1-9]/.test(amount);
}

// Tanda minus ASCII — font standar PDF (WinAnsi) tidak punya U+2212
function minus(amount: string): string {
  return hasValue(amount) ? `-${formatRupiah(amount)}` : formatRupiah(amount);
}

function sum(amounts: readonly string[]): Decimal {
  return amounts.reduce((total, amount) => total.plus(amount), new Decimal(0));
}

function percent(value: string): string {
  return `${trimDecimal(value).replace(".", ",")}%`;
}

export function buildPayslipContent(source: PayslipSource): PayslipContent {
  const { employee: snapshot, period } = source;
  const { result, pph21, takeHomePay } = snapshot;
  if (snapshot.status !== "calculated" || !result || !pph21 || takeHomePay === null) {
    throw new PayslipContentError("slip hanya untuk karyawan yang dihitung");
  }
  const { employee } = snapshot;

  const details = [
    { label: "Nama", value: employee.fullName },
    { label: "No. karyawan", value: employee.employeeNumber ?? "-" },
    { label: "Jabatan", value: employee.positionName },
    { label: "Departemen", value: employee.departmentName },
    { label: "Status PTKP", value: pph21.ptkpStatus },
    { label: "Periode absensi", value: `${formatIdDate(period.periodStart)} - ${formatIdDate(period.periodEnd)}` },
    { label: "Tanggal gajian", value: period.payDate ? formatIdDate(period.payDate) : "-" },
  ];

  // ——— Pendapatan: komponen dibayar → potongan absensi → bruto ———
  const prorated = result.proration;
  const earningLines: PayslipLine[] = result.earnings.map((line) => ({
    label: line.name,
    note:
      prorated && (line.kind === "base_salary" || line.kind === "fixed_allowance")
        ? `Prorata ${prorated.employedWorkingDays}/${prorated.periodWorkingDays} hari kerja`
        : line.code.startsWith("adjustment:")
          ? "Tambahan periode ini"
          : null,
    amount: formatRupiah(line.amount),
  }));
  const attendanceLines = (result.attendance?.lines ?? []).filter((line) => hasValue(line.amount));
  for (const line of attendanceLines) {
    earningLines.push({ label: ATTENDANCE_LABELS[line.kind], note: null, amount: minus(line.amount) });
  }

  // ——— Potongan: BPJS karyawan → potongan lain → PPh 21 ———
  const deductionLines: PayslipLine[] = result.bpjs
    .filter((line) => hasValue(line.employeeAmount))
    .map((line) => ({ label: BPJS_LABELS[line.program], note: `${percent(line.employeeRatePercent)} x ${formatRupiah(line.contributionBase)}`, amount: formatRupiah(line.employeeAmount) }));
  for (const line of result.deductions) {
    deductionLines.push({ label: line.name, note: line.code.startsWith("adjustment:") ? "Potongan tambahan periode ini" : null, amount: formatRupiah(line.amount) });
  }
  const tax = new Decimal(pph21.pph21);
  const taxNote =
    pph21.method === "ter"
      ? `TER kategori ${pph21.terKind.slice(-1).toUpperCase()}${pph21.terRatePercent ? ` ${percent(pph21.terRatePercent)}` : ""}`
      : "Masa pajak terakhir, penghitungan setahun";
  deductionLines.push(
    tax.isNegative()
      ? { label: "Pengembalian kelebihan PPh 21", note: taxNote, amount: minus(tax.negated().toFixed(2)) }
      : { label: "PPh 21", note: taxNote, amount: formatRupiah(pph21.pph21) },
  );
  const totalDeductions = new Decimal(result.totalDeductions).plus(tax);

  // Baris yang tampil harus menjumlah ke total snapshot, dan bruto − total potongan = gaji diterima
  const earned = sum(result.earnings.map((line) => line.amount)).minus(sum(attendanceLines.map((line) => line.amount)));
  const deducted = sum([...result.bpjs.map((line) => line.employeeAmount), ...result.deductions.map((line) => line.amount)]).plus(tax);
  if (!earned.equals(result.grossPay) || !deducted.equals(totalDeductions) || !new Decimal(result.grossPay).minus(totalDeductions).equals(takeHomePay)) {
    throw new PayslipContentError("rincian slip tidak sama dengan total di snapshot");
  }

  const employerLines = result.bpjs
    .filter((line) => hasValue(line.employerAmount))
    .map((line) => ({ label: `${BPJS_LABELS[line.program]} (${percent(line.employerRatePercent)})`, note: null, amount: formatRupiah(line.employerAmount) }));

  const notes: string[] = [];
  const facts = snapshot.attendanceFacts;
  if (facts) {
    const days =
      facts.employedWorkingDays === facts.periodWorkingDays
        ? `${facts.periodWorkingDays} hari kerja`
        : `${facts.employedWorkingDays} dari ${facts.periodWorkingDays} hari kerja (masa kerja)`;
    notes.push(`Kehadiran: ${days} · alpa ${facts.absentDays} · telat ${facts.lateMinutes.length}x · izin ${facts.permitDays} · sakit ${facts.sickDays}.`);
  }
  if (snapshot.attendanceWaived) notes.push("Potongan absensi dibatalkan untuk periode ini.");
  if (tax.isNegative()) notes.push("PPh 21 yang dipotong sepanjang tahun lebih besar dari terutang - kelebihannya dikembalikan bersama gaji ini.");

  return {
    monthLabel: formatIdMonth(period.month),
    company: source.company,
    details,
    earnings: { title: "Pendapatan", lines: earningLines, totalLabel: "Pendapatan bruto", total: formatRupiah(result.grossPay) },
    deductions: { title: "Potongan", lines: deductionLines, totalLabel: "Total potongan", total: formatRupiah(totalDeductions.toFixed(2)) },
    takeHomePay: formatRupiah(takeHomePay),
    employerContributions: employerLines.length > 0 ? { lines: employerLines, total: formatRupiah(result.bpjsEmployerTotal) } : null,
    notes,
    footer: `Dibuat otomatis oleh Exapay pada ${formatIdDate(source.generatedOn)} dari data payroll final. Dokumen ini rahasia dan hanya untuk karyawan yang bersangkutan.`,
  };
}

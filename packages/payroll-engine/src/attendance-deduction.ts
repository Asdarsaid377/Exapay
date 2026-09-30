import type {
  AttendanceDeductionFacts,
  AttendanceDeductionLine,
  AttendanceDeductionResult,
  AttendanceDeductionRules,
} from "@exapay/shared";

import { money, type Money, roundRupiah, rupiah, toMoneyString, ZERO } from "./money.js";

// Potongan absensi satu karyawan untuk satu periode (feature 17; dipakai payroll di feature 27) — fungsi murni.
//
// Aturan perhitungan:
// - Nilai per hari (alpa & izin/sakit yang dipotong):
//   · prorate: dasar (gaji pokok [+ tunjangan tetap]) × hari ÷ pembagi — dihitung dalam satu langkah lalu dibulatkan,
//     tanpa membulatkan tarif per hari lebih dulu. Pembagi aktual = hari kerja kalender periode.
//     Total alpa + izin/sakit tidak melebihi dasar prorata.
//   · fixed_per_day: nominal × hari
// - Izin/sakit yang dipotong dinilai sama dengan hari alpa; cuti tidak pernah dipotong.
// - Telat: kejadian dengan menit telat ≤ toleransi diabaikan; lewat toleransi → seluruh menit telat dihitung.
//   per_block = ceil(menit ÷ blok) per kejadian. Total dibatasi `monthlyCap` bila diisi.
// - Tunjangan kehadiran: forfeit = hangus penuh jika alpa ≥ N hari; reduce_per_day = berkurang per hari alpa (maks. sebesar tunjangan).
//   Pengurangan tunjangan dilaporkan sebagai baris sendiri, tidak masuk totalDeduction (mengurangi pendapatan, bukan potongan).
// - Pembulatan: tiap baris dibulatkan ke rupiah penuh (HALF_UP).

export type AttendanceDeductionSalary = {
  baseSalary: string;
  // Jumlah tunjangan tetap (dipakai jika dasar prorata = gaji pokok + tunjangan tetap)
  fixedAllowances: string;
  attendanceAllowance: string;
};

export type AttendanceDeductionInput = {
  rules: AttendanceDeductionRules;
  salary: AttendanceDeductionSalary;
  facts: AttendanceDeductionFacts;
};

type DailyRate = {
  // Nilai `days` hari potongan (belum dibulatkan) + langkah penjelasannya
  valueOf: (days: number) => { amount: Money; step: string };
  // Batas total alpa + izin/sakit (dasar prorata); null = tanpa batas
  cap: Money | null;
  steps: string[];
};

function dailyRate(rules: AttendanceDeductionRules, salary: AttendanceDeductionSalary, facts: AttendanceDeductionFacts): DailyRate | null {
  const { absence } = rules;
  if (absence.mode === "none") return null;

  if (absence.mode === "fixed_per_day") {
    const perDay = money(absence.amountPerDay);
    return {
      valueOf: (days) => {
        const amount = perDay.times(days);
        return { amount, step: `${days} hari × ${rupiah(perDay)} = ${rupiah(roundRupiah(amount))}` };
      },
      cap: null,
      steps: [`Nominal tetap ${rupiah(perDay)} per hari`],
    };
  }

  const base = money(salary.baseSalary);
  const allowances = money(salary.fixedAllowances);
  const withAllowances = absence.base === "base_and_fixed_allowances";
  const prorateBase = withAllowances ? base.plus(allowances) : base;
  const divisor = absence.divisor.mode === "actual" ? facts.periodWorkingDays : absence.divisor.days;
  const steps = [
    withAllowances
      ? `Dasar prorata: gaji pokok ${rupiah(base)} + tunjangan tetap ${rupiah(allowances)} = ${rupiah(prorateBase)}`
      : `Dasar prorata: gaji pokok ${rupiah(base)}`,
    absence.divisor.mode === "actual" ? `Pembagi: ${divisor} hari kerja di periode ini` : `Pembagi: ${divisor} hari (angka tetap)`,
  ];
  return {
    valueOf: (days) => {
      // Tidak ada hari kerja di periode (pembagi aktual 0) → tidak ada yang bisa dipotong
      if (divisor === 0) return { amount: ZERO, step: "Tidak ada hari kerja di periode ini — tidak dipotong" };
      const amount = prorateBase.times(days).div(divisor);
      return { amount, step: `${rupiah(prorateBase)} × ${days} hari ÷ ${divisor} = ${rupiah(roundRupiah(amount))}` };
    },
    cap: prorateBase,
    steps,
  };
}

function capAt(amount: Money, cap: Money | null, steps: string[], label: string): Money {
  if (cap === null || amount.lte(cap)) return amount;
  steps.push(`Dibatasi ${label} ${rupiah(cap)}`);
  return cap;
}

function lateLine(rules: AttendanceDeductionRules, facts: AttendanceDeductionFacts): AttendanceDeductionLine | null {
  const { late } = rules;
  if (late.mode === "none") return null;

  const counted = facts.lateMinutes.filter((minutes) => minutes > late.toleranceMinutes);
  const steps = [
    late.toleranceMinutes > 0
      ? `Toleransi ${late.toleranceMinutes} menit: ${counted.length} dari ${facts.lateMinutes.length} kali telat dihitung`
      : `${counted.length} kali telat dihitung (tanpa toleransi)`,
  ];
  if (counted.length === 0) return { kind: "late", amount: toMoneyString(ZERO), steps };

  let amount: Money;
  if (late.mode === "per_occurrence") {
    const perOccurrence = money(late.amountPerOccurrence);
    amount = perOccurrence.times(counted.length);
    steps.push(`${counted.length} kali × ${rupiah(perOccurrence)} = ${rupiah(amount)}`);
  } else {
    const perBlock = money(late.amountPerBlock);
    const blocks = counted.reduce((sum, minutes) => sum + Math.ceil(minutes / late.blockMinutes), 0);
    const totalMinutes = counted.reduce((sum, minutes) => sum + minutes, 0);
    amount = perBlock.times(blocks);
    steps.push(`${totalMinutes} menit telat = ${blocks} blok ${late.blockMinutes} menit (tiap kejadian dibulatkan ke atas)`);
    steps.push(`${blocks} blok × ${rupiah(perBlock)} = ${rupiah(amount)}`);
  }
  amount = capAt(amount, late.monthlyCap === null ? null : money(late.monthlyCap), steps, "batas per bulan");
  return { kind: "late", amount: toMoneyString(roundRupiah(amount)), steps };
}

function allowanceLine(
  rules: AttendanceDeductionRules,
  salary: AttendanceDeductionSalary,
  facts: AttendanceDeductionFacts,
): { line: AttendanceDeductionLine | null; paid: Money } {
  const allowance = money(salary.attendanceAllowance);
  const rule = rules.attendanceAllowance;
  if (rule.mode === "none") return { line: null, paid: allowance };

  const steps = [`Tunjangan kehadiran ${rupiah(allowance)}`];
  let reduction: Money;
  if (rule.mode === "forfeit") {
    const forfeited = facts.absentDays >= rule.minAbsentDays;
    reduction = forfeited ? allowance : ZERO;
    steps.push(
      forfeited
        ? `Alpa ${facts.absentDays} hari (batas ${rule.minAbsentDays} hari) → tunjangan hangus`
        : `Alpa ${facts.absentDays} hari (batas ${rule.minAbsentDays} hari) → dibayar penuh`,
    );
  } else {
    const perDay = money(rule.amountPerDay);
    reduction = perDay.times(facts.absentDays);
    steps.push(`${facts.absentDays} hari alpa × ${rupiah(perDay)} = ${rupiah(reduction)}`);
    reduction = capAt(reduction, allowance, steps, "sebesar tunjangan");
  }
  reduction = roundRupiah(reduction);
  return { line: { kind: "attendance_allowance", amount: toMoneyString(reduction), steps }, paid: allowance.minus(reduction) };
}

export function calculateAttendanceDeduction(input: AttendanceDeductionInput): AttendanceDeductionResult {
  const { rules, salary, facts } = input;
  const lines: AttendanceDeductionLine[] = [];
  const rate = dailyRate(rules, salary, facts);

  // Sisa batas prorata dipakai bersama alpa lalu izin/sakit
  let remainingCap = rate?.cap ?? null;
  let totalDeduction = ZERO;

  if (rate) {
    const steps = [...rate.steps];
    let amount = ZERO;
    if (facts.absentDays === 0) {
      steps.push("Tidak ada hari alpa");
    } else {
      const value = rate.valueOf(facts.absentDays);
      steps.push(`Alpa: ${value.step}`);
      amount = roundRupiah(capAt(value.amount, remainingCap, steps, "sebesar dasar prorata"));
    }
    if (remainingCap) remainingCap = remainingCap.minus(amount);
    totalDeduction = totalDeduction.plus(amount);
    lines.push({ kind: "absence", amount: toMoneyString(amount), steps });
  }

  // Skema menjamin izin/sakit hanya aktif jika aturan alpa aktif (rate ada)
  if (rate && rules.permitSick.mode !== "none") {
    const permitSickDays = facts.permitDays + facts.sickDays;
    let days: number;
    let steps: string[];
    if (rules.permitSick.mode === "without_document") {
      days = facts.undocumentedPermitSickDays;
      steps = [`Izin/sakit tanpa surat: ${days} dari ${permitSickDays} hari`];
    } else {
      days = Math.max(0, permitSickDays - rules.permitSick.freeDays);
      steps = [`Izin + sakit ${permitSickDays} hari, bebas potong ${rules.permitSick.freeDays} hari → dipotong ${days} hari`];
    }
    let amount = ZERO;
    if (days > 0) {
      const value = rate.valueOf(days);
      steps.push(value.step);
      amount = roundRupiah(capAt(value.amount, remainingCap, steps, "sisa dasar prorata"));
    }
    totalDeduction = totalDeduction.plus(amount);
    lines.push({ kind: "permit_sick", amount: toMoneyString(amount), steps });
  }

  const late = lateLine(rules, facts);
  if (late) {
    totalDeduction = totalDeduction.plus(late.amount);
    lines.push(late);
  }

  const allowance = allowanceLine(rules, salary, facts);
  if (allowance.line) lines.push(allowance.line);

  return { lines, totalDeduction: toMoneyString(totalDeduction), attendanceAllowancePaid: toMoneyString(allowance.paid) };
}

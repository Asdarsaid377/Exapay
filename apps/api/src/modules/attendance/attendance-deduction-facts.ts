import type { AttendanceDayStatus, AttendanceDeductionFacts } from "@exapay/shared";

import type { RecapDay, RecapLeave, RecapRecord } from "./attendance-recap.js";

// Fakta absensi untuk potongan (feature 17; dipakai payroll feature 27) dari hasil recapEmployee — fungsi murni.
// Hari kerja masa kerja = hari kerja kalender sejak tanggal masuk s.d. tanggal keluar (inklusif).
// Hanya hari berstatus final yang dihitung: alpa (hari kerja lampau), telat, izin/sakit disetujui di hari kerja tanpa absen.

export type DeductionLeave = RecapLeave & {
  // Pengajuan punya lampiran (surat dokter/keterangan)
  hasDocument: boolean;
};

export type DeductionFactsInput = {
  days: readonly RecapDay[];
  records: readonly RecapRecord[];
  // Hanya pengajuan disetujui
  leaves: readonly DeductionLeave[];
  // Hari kerja kalender dalam periode (pembagi aktual)
  periodWorkingDays: number;
};

// Status hari kerja di dalam masa kerja (not_employed, off, off_day_present bukan hari kerja masa kerja)
const EMPLOYED_WORKING_DAY: ReadonlySet<AttendanceDayStatus> = new Set(["on_time", "late", "absent", "permit", "sick", "leave", "pending"]);

export function deductionFacts(input: DeductionFactsInput): AttendanceDeductionFacts {
  const recordByDate = new Map(input.records.map((record) => [record.workDate, record]));
  const facts: AttendanceDeductionFacts = {
    periodWorkingDays: input.periodWorkingDays,
    employedWorkingDays: 0,
    absentDays: 0,
    lateMinutes: [],
    permitDays: 0,
    sickDays: 0,
    undocumentedPermitSickDays: 0,
  };

  for (const day of input.days) {
    if (EMPLOYED_WORKING_DAY.has(day.status)) facts.employedWorkingDays += 1;
    if (day.status === "absent") facts.absentDays += 1;
    else if (day.status === "late") facts.lateMinutes.push(recordByDate.get(day.date)?.lateMinutes ?? 0);
    else if (day.status === "permit" || day.status === "sick") {
      if (day.status === "permit") facts.permitDays += 1;
      else facts.sickDays += 1;
      // Pengajuan disetujui tidak beririsan — paling banyak satu yang cocok
      const leave = input.leaves.find((item) => item.startDate <= day.date && item.endDate >= day.date);
      if (!leave?.hasDocument) facts.undocumentedPermitSickDays += 1;
    }
  }
  return facts;
}

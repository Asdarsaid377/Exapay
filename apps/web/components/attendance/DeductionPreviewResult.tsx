import { type AttendanceDeductionPreview, formatRupiah } from "@exapay/shared";

import { LINE_LABELS } from "@/lib/attendanceDeductionLabels";
import { monthLabel } from "@/lib/attendanceLabels";

type Props = {
  preview: AttendanceDeductionPreview;
};

// Hasil pratinjau: fakta absensi bulan itu + rincian per aturan (langkah perhitungan dari payroll-engine) + total.
export function DeductionPreviewResult({ preview }: Props) {
  const { facts, result } = preview;
  const factItems = [
    `${facts.periodWorkingDays} hari kerja`,
    `Alpa ${facts.absentDays}`,
    `Telat ${facts.lateMinutes.length}×`,
    `Izin ${facts.permitDays}`,
    `Sakit ${facts.sickDays}`,
    `${facts.undocumentedPermitSickDays} izin/sakit tanpa surat`,
  ];
  const partialMonth = preview.today >= preview.from && preview.today <= preview.to;

  return (
    <div className="flex flex-col gap-4 border-t border-border-subtle pt-5" aria-live="polite">
      <div className="flex flex-col gap-1">
        <h3 className="text-[15px] font-bold text-text-primary">
          {preview.employee.fullName} · {monthLabel(preview.from.slice(0, 7))}
        </h3>
        <p className="text-small text-text-secondary tabular-nums">{factItems.join(" · ")}</p>
        {partialMonth ? (
          <p className="text-caption text-text-tertiary">Bulan berjalan — hari ini dan setelahnya belum dihitung alpa.</p>
        ) : null}
      </div>

      {result.lines.length === 0 ? (
        <p className="text-sm text-text-secondary">Semua aturan “Tidak dipotong” — tidak ada potongan absensi.</p>
      ) : (
        <ul className="flex flex-col">
          {result.lines.map((line) => (
            <li key={line.kind} className="flex flex-col gap-1.5 border-t border-border-subtle py-3.5 first:border-t-0 first:pt-0">
              <div className="flex items-baseline justify-between gap-4">
                <span className="text-[14.5px] font-bold text-text-primary">{LINE_LABELS[line.kind]}</span>
                <span className="font-display text-[17px] font-bold text-text-primary tabular-nums">{formatRupiah(line.amount)}</span>
              </div>
              <ul className="flex flex-col gap-0.5 text-small text-text-secondary tabular-nums">
                {line.steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}

      <dl className="grid gap-3 rounded-inner bg-fill-subtle px-4 py-3.5 sm:grid-cols-2">
        <div className="flex flex-col gap-0.5">
          <dt className="text-[13px] text-text-secondary">Total potongan gaji</dt>
          <dd className="font-display text-xl font-extrabold text-text-primary tabular-nums">{formatRupiah(result.totalDeduction)}</dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="text-[13px] text-text-secondary">Tunjangan kehadiran dibayar</dt>
          <dd className="font-display text-xl font-extrabold text-text-primary tabular-nums">{formatRupiah(result.attendanceAllowancePaid)}</dd>
        </div>
      </dl>
    </div>
  );
}

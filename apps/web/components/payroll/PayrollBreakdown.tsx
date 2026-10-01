import { formatRupiah, type PayrollEmployeeDetail, trimDecimal } from "@exapay/shared";
import type { ReactNode } from "react";

import { PayrollStepList } from "@/components/payroll/PayrollStepList";
import { LINE_LABELS } from "@/lib/attendanceDeductionLabels";
import { BPJS_LINE_LABELS, factsSummary, minusRupiah } from "@/lib/payrollRunLabels";
import { COMPONENT_KIND_LABELS } from "@/lib/salaryLabels";

type Props = {
  // Hanya status calculated (result, pph21, takeHomePay terisi)
  detail: PayrollEmployeeDetail;
};

type LineProps = {
  label: string;
  caption?: string;
  amount: string;
  children?: ReactNode;
};

function Line({ label, caption, amount, children }: LineProps) {
  return (
    <li className="flex flex-col gap-1.5 border-t border-border-subtle py-3 first:border-t-0 first:pt-0">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col">
          <span className="text-[14.5px] font-bold text-text-primary">{label}</span>
          {caption ? <span className="text-caption text-text-tertiary">{caption}</span> : null}
        </div>
        <span className="font-display text-[16px] font-bold whitespace-nowrap text-text-primary tabular-nums">{amount}</span>
      </div>
      {children}
    </li>
  );
}

function Group({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 border-t border-border-subtle pt-5 first:border-t-0 first:pt-0">
      <div className="flex flex-col gap-0.5">
        <h3 className="text-[15px] font-bold text-text-primary">{title}</h3>
        {note ? <p className="text-small text-text-secondary text-pretty">{note}</p> : null}
      </div>
      {children}
    </section>
  );
}

function Total({ label, amount }: { label: string; amount: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 rounded-inner bg-fill-subtle px-4 py-3">
      <span className="text-sm font-bold text-text-secondary">{label}</span>
      <span className="font-display text-lg font-extrabold whitespace-nowrap text-text-primary tabular-nums">{amount}</span>
    </div>
  );
}

// Rincian draf gaji satu karyawan (feature 29): pendapatan → potongan absensi → bruto → BPJS → potongan → PPh 21 →
// gaji diterima. Semua angka & langkah dari API (payroll-engine) — web tidak menghitung.
// Tanpa referensi desain — pola DeductionPreviewResult + EmployeeSalaryTab (izin user).
export function PayrollBreakdown({ detail }: Props) {
  const { result, pph21, salary, adjustments, attendanceFacts } = detail;
  if (!result || !pph21 || detail.takeHomePay === null) return null;

  const original = new Map(salary?.items.map((item) => [item.componentId, item.amount]));
  const overridden = new Set(adjustments.filter((a) => a.kind === "override_component").map((a) => a.componentId));
  const earningCaption = (code: string, kind: keyof typeof COMPONENT_KIND_LABELS): string => {
    if (code.startsWith("adjustment:")) return `${COMPONENT_KIND_LABELS[kind]} · tambahan periode ini`;
    const from = original.get(code);
    if (overridden.has(code) && from !== undefined) return `${COMPONENT_KIND_LABELS[kind]} · diubah dari ${formatRupiah(from)}`;
    return COMPONENT_KIND_LABELS[kind];
  };
  // Aturan tunjangan kehadiran aktif tapi karyawan tidak punya tunjangannya → baris Rp 0 tidak ditampilkan
  const attendanceLines = (result.attendance?.lines ?? []).filter((line) => line.kind !== "attendance_allowance" || /[1-9]/.test(result.attendanceAllowance));
  const waiver = adjustments.find((a) => a.kind === "waive_attendance");

  return (
    <section className="glass-strong flex flex-col gap-5 rounded-card p-5 lg:p-6">
      <div className="flex flex-col gap-1">
        <h2 className="font-display text-h2 font-bold text-text-primary">Rincian gaji</h2>
        <p className="text-small text-text-secondary">Angka draf dihitung ulang setiap halaman dibuka.</p>
      </div>

      <Group title="Pendapatan" note={result.proration ? "Gaji pokok & tunjangan tetap diprorata menurut masa kerja di periode ini." : undefined}>
        <ul className="flex flex-col">
          {result.earnings.map((line) => (
            <Line key={line.code} label={line.name} caption={earningCaption(line.code, line.kind)} amount={formatRupiah(line.amount)} />
          ))}
        </ul>
        {result.proration ? <PayrollStepList steps={result.proration.steps} label="Lihat perhitungan prorata" /> : null}
      </Group>

      <Group title="Potongan absensi" note={attendanceFacts ? factsSummary(attendanceFacts) : undefined}>
        {detail.attendanceWaived ? (
          <p className="text-small text-text-secondary">Dibatalkan untuk periode ini{waiver?.reason ? ` — ${waiver.reason}` : ""}.</p>
        ) : attendanceLines.length === 0 ? (
          <p className="text-small text-text-secondary">Tidak ada potongan absensi.</p>
        ) : (
          <ul className="flex flex-col">
            {attendanceLines.map((line) => (
              <Line
                key={line.kind}
                label={LINE_LABELS[line.kind]}
                caption={line.kind === "attendance_allowance" ? `Dibayar ${formatRupiah(result.attendanceAllowancePaid)}` : undefined}
                amount={minusRupiah(line.amount)}
              >
                <PayrollStepList steps={line.steps} />
              </Line>
            ))}
          </ul>
        )}
        <Total label="Pendapatan bruto" amount={formatRupiah(result.grossPay)} />
      </Group>

      <Group title="Iuran BPJS" note={result.bpjs.length > 0 ? `Upah dasar ${formatRupiah(result.bpjsWage)} (gaji pokok + tunjangan tetap sebulan penuh).` : "Tidak terdaftar program BPJS."}>
        {result.bpjs.length > 0 ? (
          <ul className="flex flex-col">
            {result.bpjs.map((line) => (
              <Line
                key={line.program}
                label={BPJS_LINE_LABELS[line.program]}
                caption={`Perusahaan ${formatRupiah(line.employerAmount)} · dasar ${formatRupiah(line.contributionBase)}`}
                amount={minusRupiah(line.employeeAmount)}
              >
                <PayrollStepList steps={line.steps} />
              </Line>
            ))}
          </ul>
        ) : null}
        {result.bpjs.length > 0 ? (
          <p className="text-caption text-text-tertiary tabular-nums">
            Ditanggung perusahaan {formatRupiah(result.bpjsEmployerTotal)} · dipotong dari gaji {formatRupiah(result.bpjsEmployeeTotal)}
          </p>
        ) : null}
      </Group>

      <Group title="Potongan">
        <ul className="flex flex-col">
          <Line label="Iuran BPJS karyawan" amount={minusRupiah(result.bpjsEmployeeTotal)} />
          {result.deductions.map((line) => (
            <Line
              key={line.code}
              label={line.name}
              caption={line.code.startsWith("adjustment:") ? "Potongan tambahan periode ini" : earningCaption(line.code, line.kind)}
              amount={minusRupiah(line.amount)}
            />
          ))}
        </ul>
        <Total label="Gaji bersih sebelum PPh 21" amount={formatRupiah(result.netPay)} />
      </Group>

      <Group
        title="PPh 21"
        note={
          pph21.method === "ter"
            ? `Status PTKP ${pph21.ptkpStatus} · TER kategori ${pph21.terKind.slice(-1).toUpperCase()}${pph21.terRatePercent ? ` · tarif ${trimDecimal(pph21.terRatePercent).replace(".", ",")}%` : ""}`
            : `Status PTKP ${pph21.ptkpStatus} · masa pajak terakhir, penghitungan setahun (tarif Pasal 17)`
        }
      >
        <ul className="flex flex-col">
          <Line label="PPh 21 masa ini" caption={`Penghasilan bruto pajak ${formatRupiah(pph21.grossIncome)}`} amount={minusRupiah(pph21.pph21)}>
            <PayrollStepList steps={pph21.steps} />
          </Line>
        </ul>
      </Group>

      <dl className="flex items-baseline justify-between gap-4 rounded-inner bg-accent-soft px-4 py-4">
        <dt className="text-sm font-bold text-text-primary">Gaji diterima</dt>
        <dd className="font-display text-2xl font-extrabold whitespace-nowrap text-text-primary tabular-nums">{formatRupiah(detail.takeHomePay)}</dd>
      </dl>
    </section>
  );
}

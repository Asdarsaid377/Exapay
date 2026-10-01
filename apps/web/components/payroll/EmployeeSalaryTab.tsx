"use client";

import { type EmployeeSalaryOverview, formatRupiah } from "@exapay/shared";
import { CloudOff, Pencil, Wallet } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/common/Button";
import { EmptyState } from "@/components/common/EmptyState";
import { FormSection } from "@/components/common/FormSection";
import { EmployeeSalaryForm } from "@/components/payroll/EmployeeSalaryForm";
import { EmployeeSalaryVersionList } from "@/components/payroll/EmployeeSalaryVersionList";
import { formatIsoDate } from "@/lib/datetime";
import { bpjsSummary, COMPONENT_KIND_LABELS, currentSalaryVersion, JKK_RISK_LABELS } from "@/lib/salaryLabels";

type Props = {
  employeeId: string;
  firstName: string;
  overview: EmployeeSalaryOverview | null;
  error: string | null;
};

// Tab Gaji /employees/[id] (owner/admin): gaji saat ini + riwayat versi; "Ubah gaji" membuka form versi baru di tempat.
export function EmployeeSalaryTab({ employeeId, firstName, overview, error }: Props) {
  const [editing, setEditing] = useState(false);

  if (!overview) {
    return <EmptyState icon={CloudOff} title="Gaji tidak dapat dimuat" description={error ?? "Muat ulang halaman lalu coba lagi."} />;
  }
  if (editing) {
    return <EmployeeSalaryForm employeeId={employeeId} overview={overview} onCancel={() => setEditing(false)} onSaved={() => setEditing(false)} />;
  }

  const current = currentSalaryVersion(overview.versions);
  if (!current) {
    return (
      <EmptyState
        icon={Wallet}
        title="Gaji belum diatur"
        description={`Isi gaji pokok, tunjangan, dan kepesertaan BPJS ${firstName} agar ikut dihitung di payroll.`}
        action={<Button onClick={() => setEditing(true)}>Atur gaji</Button>}
      />
    );
  }

  const edit = (
    <Button variant="secondary" onClick={() => setEditing(true)}>
      <Pencil aria-hidden className="size-4" />
      Ubah gaji
    </Button>
  );

  return (
    <div className="flex flex-col gap-4 lg:gap-5">
      <FormSection
        title={current.status === "active" ? "Gaji saat ini" : "Gaji terjadwal"}
        description={`Berlaku mulai ${formatIsoDate(current.effectiveFrom)}${current.effectiveTo ? ` sampai ${formatIsoDate(current.effectiveTo)}` : ""}. Nominal per bulan sebelum prorata, potongan absensi, BPJS, dan PPh 21.`}
        aside={edit}
      >
        <div className="flex flex-col gap-4">
          <ul className="flex flex-col">
            {current.items.map((item) => (
              <li key={item.componentId} className="flex items-center justify-between gap-4 border-t border-border-subtle py-3 first:border-t-0 first:pt-0">
                <div className="flex min-w-0 flex-col">
                  <span className="text-[14.5px] font-bold text-text-primary">{item.name}</span>
                  <span className="text-caption text-text-tertiary">{COMPONENT_KIND_LABELS[item.kind]}</span>
                </div>
                <span className="font-display text-[17px] font-bold whitespace-nowrap text-text-primary tabular-nums">
                  {item.kind === "deduction" ? `−${formatRupiah(item.amount)}` : formatRupiah(item.amount)}
                </span>
              </li>
            ))}
          </ul>
          <dl className="grid gap-x-4 gap-y-2 rounded-inner bg-fill-subtle px-4 py-3.5 sm:grid-cols-2">
            <div className="flex flex-col gap-0.5">
              <dt className="text-caption text-text-tertiary">Total pendapatan</dt>
              <dd className="font-display text-xl font-extrabold text-text-primary tabular-nums">{formatRupiah(current.earningsTotal)}</dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="text-caption text-text-tertiary">Total potongan</dt>
              <dd className="font-display text-xl font-extrabold text-text-primary tabular-nums">{formatRupiah(current.deductionsTotal)}</dd>
            </div>
          </dl>
          <dl className="grid gap-x-4 gap-y-1 text-small sm:grid-cols-[120px_minmax(0,1fr)]">
            <dt className="text-text-tertiary">BPJS</dt>
            <dd className="text-text-secondary">{bpjsSummary(current.bpjsPrograms)}</dd>
            {current.bpjsPrograms.includes("jkk") ? (
              <>
                <dt className="text-text-tertiary">Risiko JKK</dt>
                <dd className="text-text-secondary">{JKK_RISK_LABELS[overview.jkkRiskLevel]}</dd>
              </>
            ) : null}
            {current.note ? (
              <>
                <dt className="text-text-tertiary">Catatan</dt>
                <dd className="text-text-secondary">{current.note}</dd>
              </>
            ) : null}
          </dl>
        </div>
      </FormSection>

      <FormSection
        title="Riwayat gaji"
        description="Payroll memakai gaji yang berlaku pada periodenya. Gaji lama tidak diubah — perubahan disimpan sebagai versi baru."
      >
        <EmployeeSalaryVersionList versions={overview.versions} />
      </FormSection>
    </div>
  );
}

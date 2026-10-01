import { type EmployeeSalaryVersion, formatRupiah } from "@exapay/shared";

import { Badge } from "@/components/common/Badge";
import { VERSION_STATUS_LABELS, VERSION_STATUS_TONES } from "@/lib/attendanceDeductionLabels";
import { formatDateTime, formatIsoDate } from "@/lib/datetime";
import { bpjsSummary } from "@/lib/salaryLabels";

type Props = {
  versions: EmployeeSalaryVersion[];
};

// Riwayat versi gaji (terbaru di atas; pola DeductionRuleVersionList). Payroll memakai versi yang berlaku pada periodenya.
export function EmployeeSalaryVersionList({ versions }: Props) {
  return (
    <ul className="flex flex-col">
      {versions.map((version) => (
        <li key={version.id} className="flex flex-col gap-2 border-t border-border-subtle py-3.5 first:border-t-0 first:pt-0">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className={`text-[14.5px] font-bold tabular-nums ${version.status === "ended" ? "text-text-secondary" : "text-text-primary"}`}>
                {formatIsoDate(version.effectiveFrom)} – {version.effectiveTo ? formatIsoDate(version.effectiveTo) : "seterusnya"}
              </span>
              <span className="text-caption text-text-tertiary">
                Disimpan {version.createdByName ? `oleh ${version.createdByName} ` : ""}· {formatDateTime(version.createdAt)}
              </span>
            </div>
            <Badge tone={VERSION_STATUS_TONES[version.status]}>{VERSION_STATUS_LABELS[version.status]}</Badge>
          </div>
          <dl className="grid gap-x-4 gap-y-1 text-small sm:grid-cols-[120px_minmax(0,1fr)]">
            <dt className="text-text-tertiary">Komponen</dt>
            <dd className="text-text-secondary">
              {version.items.map((item) => `${item.name} ${formatRupiah(item.amount)}`).join(" · ")}
            </dd>
            <dt className="text-text-tertiary">BPJS</dt>
            <dd className="text-text-secondary">{bpjsSummary(version.bpjsPrograms)}</dd>
            {version.note ? (
              <>
                <dt className="text-text-tertiary">Catatan</dt>
                <dd className="text-text-secondary">{version.note}</dd>
              </>
            ) : null}
          </dl>
        </li>
      ))}
    </ul>
  );
}

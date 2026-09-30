import type { AttendanceDeductionRuleVersion } from "@exapay/shared";

import { Badge } from "@/components/common/Badge";
import { rulesSummary, VERSION_STATUS_LABELS, VERSION_STATUS_TONES } from "@/lib/attendanceDeductionLabels";
import { formatDateTime, formatIsoDate } from "@/lib/datetime";

type Props = {
  versions: AttendanceDeductionRuleVersion[];
};

// Riwayat versi aturan potongan (terbaru di atas). Versi lama tetap tersimpan — dipakai payroll untuk periode lampau.
export function DeductionRuleVersionList({ versions }: Props) {
  if (versions.length === 0) {
    return <p className="text-sm text-text-secondary">Belum ada aturan yang disimpan. Selama belum ada, gaji tidak dipotong karena absensi.</p>;
  }
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
            {rulesSummary(version.rules).map((item) => (
              <div key={item.label} className="contents">
                <dt className="text-text-tertiary">{item.label}</dt>
                <dd className="text-text-secondary">{item.value}</dd>
              </div>
            ))}
          </dl>
        </li>
      ))}
    </ul>
  );
}

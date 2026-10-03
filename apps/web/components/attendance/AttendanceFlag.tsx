import type { AttendanceReviewItem } from "@exapay/shared";

import { Badge } from "@/components/common/Badge";
import { FLAG_TONES, flagDetail, flagLabel } from "@/lib/workLocationLabels";

type Props = {
  flag: AttendanceReviewItem["flag"];
  workDate: string;
  // inline: badge + rincian sebaris (ringkasan di dialog)
  layout?: "stack" | "inline";
};

// Badge jenis tanda + satu baris rincian (design geofence-components "AttendanceFlagBadge + FlagDetail").
// Struktur sama untuk semua jenis — jenis baru (mis. "Tanpa jadwal") cukup menambah label, tone, dan rincian.
export function AttendanceFlag({ flag, workDate, layout = "stack" }: Props) {
  return (
    <div className={layout === "inline" ? "flex flex-wrap items-center gap-x-2.5 gap-y-1.5" : "flex min-w-0 flex-col items-start gap-1.25"}>
      <Badge tone={FLAG_TONES[flag.kind]}>{flagLabel(flag.kind)}</Badge>
      <span className="text-[13.5px] text-pretty text-neutral-text tabular-nums">{flagDetail(flag, workDate)}</span>
    </div>
  );
}

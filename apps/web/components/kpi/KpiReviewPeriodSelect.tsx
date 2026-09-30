"use client";

import type { KpiReviewPeriod } from "@exapay/shared";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { SelectField } from "@/components/common/SelectField";
import { reviewPeriodLabel, reviewPeriodRange, reviewsHref } from "@/lib/kpiReviewLabels";

type Props = {
  periods: KpiReviewPeriod[];
  value: string;
};

// Pilih periode penilaian di URL ?period= — pola KpiScoreTeamSelect. Dikunci selama halaman baru dimuat.
export function KpiReviewPeriodSelect({ periods, value }: Props) {
  const router = useRouter();
  const [loading, startTransition] = useTransition();

  return (
    <div className="glass rounded-card p-2 sm:p-2.5 lg:w-96 lg:shrink-0">
      <SelectField
        id="kpi-review-period-filter"
        label="Periode penilaian"
        labelHidden
        value={value}
        disabled={loading}
        onChange={(e) => startTransition(() => router.push(reviewsHref(e.target.value), { scroll: false }))}
      >
        {periods.map((period) => (
          <option key={period.id} value={period.id}>
            {reviewPeriodLabel(period.cycle, period)}
            {period.cycle === "weekly" ? "" : ` (${reviewPeriodRange(period)})`}
          </option>
        ))}
      </SelectField>
    </div>
  );
}

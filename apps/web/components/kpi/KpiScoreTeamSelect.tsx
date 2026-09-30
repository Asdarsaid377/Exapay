"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { SelectField } from "@/components/common/SelectField";
import type { PeriodView } from "@/lib/attendanceRecapLabels";
import { kpiScoresHref } from "@/lib/kpiScoreLabels";

type Props = {
  departments: { id: string; name: string }[];
  value: string | null;
  // Periode dipertahankan saat tim berganti
  view: PeriodView;
  currentMonth: string;
};

// Filter tim (departemen) skor KPI di URL ?team= — pola CorrectionEmployeeSelect. Dikunci selama halaman baru dimuat.
export function KpiScoreTeamSelect({ departments, value, view, currentMonth }: Props) {
  const router = useRouter();
  const [loading, startTransition] = useTransition();

  return (
    <div className="glass rounded-card p-2 sm:p-2.5 lg:w-72 lg:shrink-0">
      <SelectField
        id="kpi-score-team"
        label="Tim"
        labelHidden
        value={value ?? ""}
        disabled={loading}
        onChange={(e) => {
          const href = kpiScoresHref(view, currentMonth, e.target.value || null);
          startTransition(() => router.push(href, { scroll: false }));
        }}
      >
        <option value="">Semua tim</option>
        {departments.map((department) => (
          <option key={department.id} value={department.id}>
            {department.name}
          </option>
        ))}
      </SelectField>
    </div>
  );
}

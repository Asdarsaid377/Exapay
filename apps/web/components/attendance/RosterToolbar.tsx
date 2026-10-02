"use client";

import type { OrgItem } from "@exapay/shared";
import { ChevronLeft, ChevronRight, Copy } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { CopyRosterWeekDialog } from "@/components/attendance/CopyRosterWeekDialog";
import { Button } from "@/components/common/Button";
import { SegmentedControl } from "@/components/common/SegmentedControl";
import { SelectField } from "@/components/common/SelectField";
import { addIsoDays, rosterHref, weekRangeLabel } from "@/lib/shiftLabels";

type Props = {
  weekStart: string;
  // Senin minggu berjalan
  currentWeekStart: string;
  departmentId: string | null;
  departments: readonly OrgItem[];
  // false = tidak ada karyawan shift yang bisa disalin (tombol disembunyikan)
  canCopy: boolean;
};

const NAV_BUTTON =
  "grid size-11 shrink-0 place-items-center rounded-full border border-border-control bg-control text-text-primary transition-colors hover:border-border-control-hover hover:bg-surface-solid focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-accent/45 disabled:opacity-50 lg:size-10";

// Navigasi minggu + Minggu ini | Minggu depan + departemen + Salin minggu lalu (design attendance-roster "WeekNavigator").
// Minggu & departemen di URL.
export function RosterToolbar({ weekStart, currentWeekStart, departmentId, departments, canCopy }: Props) {
  const router = useRouter();
  const [loading, startTransition] = useTransition();
  const [copyOpen, setCopyOpen] = useState(false);
  const go = (week: string, department: string | null): void =>
    startTransition(() => router.push(rosterHref({ week: week === currentWeekStart ? null : week, departmentId: department }), { scroll: false }));

  const nextWeekStart = addIsoDays(currentWeekStart, 7);
  const relative = weekStart === currentWeekStart ? "this" : weekStart === nextWeekStart ? "next" : "";
  const label = weekRangeLabel(weekStart, addIsoDays(weekStart, 6));

  return (
    <div className="flex flex-col gap-2.5 lg:glass lg:flex-row lg:items-center lg:rounded-card lg:p-2.5">
      <div className="flex items-center justify-between gap-1 lg:justify-start">
        <button type="button" aria-label="Minggu sebelumnya" className={NAV_BUTTON} disabled={loading} onClick={() => go(addIsoDays(weekStart, -7), departmentId)}>
          <ChevronLeft aria-hidden className="size-4.25" />
        </button>
        <span className="min-w-37.5 text-center font-display text-[15px] font-bold text-text-primary tabular-nums">{label}</span>
        <button type="button" aria-label="Minggu berikutnya" className={NAV_BUTTON} disabled={loading} onClick={() => go(addIsoDays(weekStart, 7), departmentId)}>
          <ChevronRight aria-hidden className="size-4.25" />
        </button>
      </div>
      <div className="grid gap-2 sm:flex sm:items-center lg:contents">
        <SegmentedControl
          label="Minggu"
          options={[
            { value: "this", label: "Minggu ini" },
            { value: "next", label: "Minggu depan" },
          ]}
          value={relative}
          disabled={loading}
          fullWidth
          onChange={(value) => go(value === "next" ? nextWeekStart : currentWeekStart, departmentId)}
        />
        {departments.length > 1 ? (
          <div className="sm:w-52.5">
            <SelectField
              id="roster-department"
              label="Departemen"
              labelHidden
              value={departmentId ?? ""}
              disabled={loading}
              onChange={(e) => go(weekStart, e.target.value || null)}
            >
              <option value="">Semua departemen</option>
              {departments.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
            </SelectField>
          </div>
        ) : null}
      </div>
      {canCopy ? (
        <Button variant="secondary" className="h-11.5 lg:ml-auto lg:h-10" onClick={() => setCopyOpen(true)}>
          <Copy aria-hidden className="size-4" />
          Salin minggu lalu
        </Button>
      ) : null}
      {copyOpen ? <CopyRosterWeekDialog open onClose={() => setCopyOpen(false)} weekStart={weekStart} departmentId={departmentId} /> : null}
    </div>
  );
}

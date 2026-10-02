"use client";

import { ATTENDANCE_FLAG_KINDS, ATTENDANCE_FLAG_LABELS, type AttendanceReviewFilter as StatusFilter, type AttendanceReviewListQuery } from "@exapay/shared";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { SegmentedControl } from "@/components/common/SegmentedControl";
import { SelectField } from "@/components/common/SelectField";
import { monthLabel, shiftMonth } from "@/lib/attendanceLabels";
import { attendanceReviewsHref } from "@/lib/workLocationLabels";

type Props = {
  query: AttendanceReviewListQuery;
  pendingCount: number;
  // Bulan berjalan di zona waktu usaha (YYYY-MM) — pilihan bulan mundur 12 bulan dari sini
  currentMonth: string;
};

const MONTHS_BACK = 12;

// Filter antrean tinjauan di URL (design attendance-review: segmented status + select jenis tanda + periode).
// Periode berupa pilihan bulan; tanpa bulan = semua tanggal (tinjauan tertunda bulan lalu tetap terlihat).
export function AttendanceReviewFilter({ query, pendingCount, currentMonth }: Props) {
  const router = useRouter();
  const [loading, startTransition] = useTransition();
  const go = (next: Partial<AttendanceReviewListQuery>): void =>
    startTransition(() => router.push(attendanceReviewsHref({ ...query, ...next, page: 1 }), { scroll: false }));

  const statusOptions = [
    { value: "pending", label: pendingCount > 0 ? `Perlu ditinjau (${pendingCount})` : "Perlu ditinjau" },
    { value: "reviewed", label: "Sudah ditinjau" },
    { value: "all", label: "Semua" },
  ] as const;
  const months = Array.from({ length: MONTHS_BACK }, (_, i) => shiftMonth(currentMonth, -i));

  return (
    <div className="flex flex-col gap-2.5 lg:glass lg:flex-row lg:items-center lg:rounded-card lg:p-2.5">
      <div className="max-sm:overflow-x-auto">
        <SegmentedControl
          label="Status tinjauan"
          options={statusOptions}
          value={query.status}
          disabled={loading}
          onChange={(status: StatusFilter) => go({ status })}
        />
      </div>
      <div className="grid grid-cols-2 gap-2 lg:ml-auto lg:flex lg:gap-2.5">
        <div className="lg:w-55">
          <SelectField
            id="review-flag"
            label="Jenis tanda"
            labelHidden
            value={query.flag}
            disabled={loading}
            onChange={(e) => go({ flag: e.target.value === "all" ? "all" : (ATTENDANCE_FLAG_KINDS.find((kind) => kind === e.target.value) ?? "all") })}
          >
            <option value="all">Semua jenis tanda</option>
            {ATTENDANCE_FLAG_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {ATTENDANCE_FLAG_LABELS[kind]}
              </option>
            ))}
          </SelectField>
        </div>
        <div className="lg:w-55">
          <SelectField
            id="review-month"
            label="Periode"
            labelHidden
            value={query.month ?? ""}
            disabled={loading}
            onChange={(e) => go({ month: e.target.value || undefined })}
          >
            <option value="">Semua tanggal</option>
            {months.map((month) => (
              <option key={month} value={month}>
                {monthLabel(month)}
              </option>
            ))}
          </SelectField>
        </div>
      </div>
    </div>
  );
}

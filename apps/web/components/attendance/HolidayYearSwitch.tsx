"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { SegmentedControl } from "@/components/common/SegmentedControl";
import { attendanceSettingsHref } from "@/lib/workCalendarLabels";

type Props = {
  year: number;
  years: number[];
  currentYear: number;
};

// Pilihan tahun daftar hari libur (disimpan di URL ?year=)
export function HolidayYearSwitch({ year, years, currentYear }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const options = years.map((y) => ({ value: String(y), label: String(y) }));

  return (
    <SegmentedControl
      label="Tahun hari libur"
      options={options}
      value={String(year)}
      disabled={pending}
      onChange={(value) => startTransition(() => router.push(attendanceSettingsHref(Number(value), currentYear), { scroll: false }))}
    />
  );
}

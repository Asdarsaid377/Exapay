"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { SelectField } from "@/components/common/SelectField";
import { correctionsHref, type PeriodView } from "@/lib/attendanceRecapLabels";

type Props = {
  employees: { id: string; fullName: string; positionName: string }[];
  value: string | null;
  // Periode dipertahankan saat karyawan berganti
  view: PeriodView;
  currentMonth: string;
};

// Pilih karyawan di halaman koreksi (di URL ?employee=; kosong = riwayat semua koreksi). Dikunci selama halaman baru dimuat.
export function CorrectionEmployeeSelect({ employees, value, view, currentMonth }: Props) {
  const router = useRouter();
  const [loading, startTransition] = useTransition();

  return (
    <div className="glass rounded-card p-2 sm:p-2.5 lg:w-96 lg:shrink-0">
      <SelectField
        id="correction-employee"
        label="Karyawan"
        labelHidden
        value={value ?? ""}
        disabled={loading}
        onChange={(e) => {
          const href = correctionsHref({ employeeId: e.target.value || null, view, currentMonth });
          startTransition(() => router.push(href, { scroll: false }));
        }}
      >
        <option value="">Pilih karyawan…</option>
        {employees.map((employee) => (
          <option key={employee.id} value={employee.id}>
            {employee.fullName} — {employee.positionName}
          </option>
        ))}
      </SelectField>
    </div>
  );
}

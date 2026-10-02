import { attendanceMonthSchema } from "@exapay/shared";
import { ArrowLeft, CloudOff } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { z } from "zod";

import { EmptyState } from "@/components/common/EmptyState";
import { EmployeeAttendanceTab } from "@/components/employees/EmployeeAttendanceTab";
import { EmployeeAttendanceSettingsSection } from "@/components/employees/EmployeeAttendanceSettingsSection";
import { EmployeeDetailView } from "@/components/employees/EmployeeDetailView";
import { EmployeeKpiTab } from "@/components/employees/EmployeeKpiTab";
import { fetchEmployeeAttendanceDays } from "@/lib/api/attendanceRecap";
import { fetchEmployee, fetchEmployeeFormOptions } from "@/lib/api/employees";
import { fetchEmployeeKpiReviews } from "@/lib/api/kpiReviews";
import { fetchEmployeeKpiScore } from "@/lib/api/kpiScores";
import { fetchEmployeeSalary } from "@/lib/api/salary";
import { fetchEmployeeAttendanceSettings } from "@/lib/api/workLocations";
import { periodQueryFrom } from "@/lib/attendanceRecapLabels";
import { firstNameOf } from "@/lib/datetime";
import { EMPLOYEE_DETAIL_TABS, type EmployeeDetailTab } from "@/lib/employeeLabels";

export const metadata: Metadata = { title: "Detail karyawan — Exapay" };

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const tabSchema = z.enum(EMPLOYEE_DETAIL_TABS).catch("data");

// Detail karyawan (feature 11, tab Data; tab Gaji owner/admin — feature 28; tab KPI & Absensi — feature 37b).
// Karyawan di luar cakupan penglihat (mis. bukan bawahan atasan) → 404. Data tab KPI/Absensi hanya dimuat saat tab itu aktif.
export default async function EmployeeDetailPage({ params, searchParams }: Props) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const raw = await searchParams;
  const requestedTab: EmployeeDetailTab = tabSchema.parse(raw.tab);

  const result = await fetchEmployee(id);
  if (!result.ok && (result.status === 404 || result.status === 403)) notFound();
  if (!result.ok) {
    return (
      <>
        <Link href="/employees" className="inline-flex items-center gap-1.5 self-start px-1.5 text-sm font-bold text-accent-strong hover:text-accent-hover">
          <ArrowLeft aria-hidden className="size-4" />
          Karyawan
        </Link>
        <EmptyState icon={CloudOff} title="Data karyawan tidak dapat dimuat" description={result.error} />
      </>
    );
  }
  const employee = result.data;
  // Tab Gaji hanya owner/admin — selain itu kembali ke Data
  const tab: EmployeeDetailTab = requestedTab === "salary" && !employee.canManage ? "data" : requestedTab;
  const [options, salary] = employee.canManage ? await Promise.all([fetchEmployeeFormOptions(employee.id), fetchEmployeeSalary(employee.id)]) : [null, null];

  let tabContent: ReactNode = null;
  let attendanceSection: ReactNode = null;
  if (tab === "data") {
    // Pengaturan absen (feature 44): gagal dimuat → section tidak ditampilkan (data lain tetap terbaca)
    const settings = await fetchEmployeeAttendanceSettings(employee.id);
    if (settings.ok) attendanceSection = <EmployeeAttendanceSettingsSection key={employee.id} employeeId={employee.id} settings={settings.data} />;
  } else if (tab === "kpi") {
    const month = attendanceMonthSchema.safeParse(typeof raw.month === "string" ? raw.month : undefined);
    const [score, reviews] = await Promise.all([fetchEmployeeKpiScore(employee.id, month.success ? month.data : null), fetchEmployeeKpiReviews(employee.id)]);
    tabContent = <EmployeeKpiTab employeeId={employee.id} firstName={firstNameOf(employee.fullName)} score={score} reviews={reviews} />;
  } else if (tab === "attendance") {
    const period = periodQueryFrom(raw);
    const days = await fetchEmployeeAttendanceDays(employee.id, period);
    tabContent = <EmployeeAttendanceTab employeeId={employee.id} period={period} days={days} />;
  }

  return (
    <EmployeeDetailView
      employee={employee}
      options={options?.ok ? options.data : null}
      salary={salary ? { overview: salary.ok ? salary.data : null, error: salary.ok ? null : salary.error } : null}
      tab={tab}
      tabContent={tabContent}
      attendanceSection={attendanceSection}
    />
  );
}

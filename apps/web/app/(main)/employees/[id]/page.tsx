import { ArrowLeft, CloudOff } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";

import { EmptyState } from "@/components/common/EmptyState";
import { EmployeeDetailView } from "@/components/employees/EmployeeDetailView";
import { fetchEmployee, fetchEmployeeFormOptions } from "@/lib/api/employees";

export const metadata: Metadata = { title: "Detail karyawan — Exapay" };

type Props = {
  params: Promise<{ id: string }>;
};

// Detail karyawan (feature 11, tab Data). Karyawan di luar cakupan penglihat (mis. bukan bawahan atasan) → 404.
export default async function EmployeeDetailPage({ params }: Props) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();

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
  const options = employee.canManage ? await fetchEmployeeFormOptions(employee.id) : null;

  return <EmployeeDetailView employee={employee} options={options?.ok ? options.data : null} />;
}

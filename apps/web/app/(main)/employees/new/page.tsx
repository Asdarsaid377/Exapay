import { ArrowLeft, CloudOff, Network } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { buttonClassName } from "@/components/common/Button";
import { EmptyState } from "@/components/common/EmptyState";
import { EmployeeForm } from "@/components/employees/EmployeeForm";
import { PageHeader } from "@/components/layout/PageHeader";
import { fetchEmployeeFormOptions } from "@/lib/api/employees";

export const metadata: Metadata = { title: "Tambah karyawan — Exapay" };

// Tambah karyawan (feature 11) — owner/admin. Atasan (403 dari API) mendapat 404.
export default async function NewEmployeePage() {
  const result = await fetchEmployeeFormOptions();
  if (!result.ok && result.status === 403) notFound();

  const back = (
    <Link href="/employees" className="inline-flex items-center gap-1.5 self-start px-1.5 text-sm font-bold text-accent-strong hover:text-accent-hover">
      <ArrowLeft aria-hidden className="size-4" />
      Karyawan
    </Link>
  );

  if (!result.ok) {
    return (
      <>
        {back}
        <PageHeader title="Tambah karyawan" />
        <EmptyState icon={CloudOff} title="Form tidak dapat dimuat" description={result.error} />
      </>
    );
  }
  const options = result.data;

  // Departemen & jabatan wajib — arahkan ke Organisasi dulu
  if (options.departments.length === 0 || options.positions.length === 0) {
    return (
      <>
        {back}
        <PageHeader title="Tambah karyawan" />
        <EmptyState
          icon={Network}
          title="Buat departemen & jabatan dulu"
          description="Setiap karyawan masuk ke satu departemen dan satu jabatan. Tambahkan minimal satu dari masing-masing di menu Organisasi."
          action={
            <Link href="/organization" className={buttonClassName()}>
              Buka Organisasi
            </Link>
          }
        />
      </>
    );
  }

  return (
    <>
      <div className="-mb-2 flex flex-col gap-1.5">
        {back}
        <PageHeader
          title="Tambah karyawan"
          description={
            <>
              Kolom bertanda <span className="text-danger-text">*</span> wajib diisi.
            </>
          }
        />
      </div>
      <EmployeeForm id="employee-new" options={options} />
    </>
  );
}

import { ArrowLeft, CloudOff, Network } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { buttonClassName } from "@/components/common/Button";
import { EmptyState } from "@/components/common/EmptyState";
import { EmployeeImportFlow } from "@/components/employees/EmployeeImportFlow";
import { PageHeader } from "@/components/layout/PageHeader";
import { fetchEmployeeFormOptions } from "@/lib/api/employees";

export const metadata: Metadata = { title: "Impor karyawan — Exapay" };

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

// Impor karyawan dari Excel (feature 12) — owner/admin. Atasan (403 dari API) mendapat 404.
// Pilihan form dipakai untuk memastikan departemen & jabatan sudah ada (keduanya wajib per baris).
export default async function ImportEmployeesPage({ searchParams }: Props) {
  const [result, raw] = await Promise.all([fetchEmployeeFormOptions(), searchParams]);
  if (!result.ok && result.status === 403) notFound();

  const header = (
    <div className="-mb-2 flex flex-col gap-1.5">
      <Link href="/employees" className="inline-flex items-center gap-1.5 self-start px-1.5 text-sm font-bold text-accent-strong hover:text-accent-hover">
        <ArrowLeft aria-hidden className="size-4" />
        Karyawan
      </Link>
      <PageHeader title="Impor karyawan" description="Tambahkan banyak karyawan sekaligus dari file Excel (.xlsx)." />
    </div>
  );

  if (!result.ok) {
    return (
      <>
        {header}
        <EmptyState icon={CloudOff} title="Halaman impor tidak dapat dimuat" description={result.error} />
      </>
    );
  }

  if (result.data.departments.length === 0 || result.data.positions.length === 0) {
    return (
      <>
        {header}
        <EmptyState
          icon={Network}
          title="Buat departemen & jabatan dulu"
          description="Setiap baris di file harus menyebut departemen dan jabatan yang sudah ada. Tambahkan minimal satu dari masing-masing di menu Organisasi."
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
      {header}
      <EmployeeImportFlow templateError={raw.template === "error"} />
    </>
  );
}

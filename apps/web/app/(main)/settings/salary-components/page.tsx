import { CloudOff } from "lucide-react";
import type { Metadata } from "next";

import { EmptyState } from "@/components/common/EmptyState";
import { FormSection } from "@/components/common/FormSection";
import { PageHeader } from "@/components/layout/PageHeader";
import { JkkRiskLevelForm } from "@/components/payroll/JkkRiskLevelForm";
import { SalaryComponentList } from "@/components/payroll/SalaryComponentList";
import { fetchSalaryComponentSettings } from "@/lib/api/salary";

export const metadata: Metadata = { title: "Komponen gaji — Exapay" };

// Katalog komponen gaji & kelompok risiko JKK (feature 28). Proxy sudah membatasi ke owner/admin; API memeriksa ulang.
// Nilai gaji per karyawan diatur di tab Gaji /employees/[id].
export default async function SettingsSalaryComponentsPage() {
  const result = await fetchSalaryComponentSettings();
  const header = (
    <PageHeader
      title="Komponen gaji"
      description="Komponen pendapatan dan potongan yang dipakai di gaji karyawan, serta kelompok risiko JKK usaha. Nilai gaji tiap karyawan diatur di tab Gaji pada data karyawan."
    />
  );

  if (!result.ok) {
    return (
      <>
        {header}
        <EmptyState icon={CloudOff} title="Komponen gaji tidak dapat dimuat" description={result.error} />
      </>
    );
  }

  return (
    <>
      {header}
      <div className="flex flex-col gap-4 lg:gap-5">
        <SalaryComponentList components={result.data.components} />
        <FormSection
          title="BPJS Ketenagakerjaan"
          description="Kelompok risiko lingkungan kerja menentukan tarif iuran Jaminan Kecelakaan Kerja (JKK), ditanggung perusahaan."
        >
          <JkkRiskLevelForm key={result.data.jkkRiskLevel} jkkRiskLevel={result.data.jkkRiskLevel} />
        </FormSection>
      </div>
    </>
  );
}

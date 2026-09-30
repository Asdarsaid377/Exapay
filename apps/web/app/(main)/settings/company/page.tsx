import { CloudOff } from "lucide-react";
import type { Metadata } from "next";

import { EmptyState } from "@/components/common/EmptyState";
import { CompanyProfileForm } from "@/components/company/CompanyProfileForm";
import { PageHeader } from "@/components/layout/PageHeader";
import { fetchCompanyProfile, fetchRegions } from "@/lib/api/company";

export const metadata: Metadata = { title: "Profil usaha — Exapay" };

// Profil usaha aktif (feature 09). Proxy sudah membatasi ke owner/admin; API memeriksa ulang.
export default async function SettingsCompanyPage() {
  const [profile, regions] = await Promise.all([fetchCompanyProfile(), fetchRegions()]);
  const header = <PageHeader title="Profil usaha" description="Data usaha yang dipakai untuk payroll, pajak, dan pengingat kepatuhan." />;

  if (!profile.ok || !regions.ok) {
    const error = !profile.ok ? profile.error : !regions.ok ? regions.error : "";
    return (
      <>
        {header}
        <EmptyState icon={CloudOff} title="Profil usaha tidak dapat dimuat" description={error} />
      </>
    );
  }

  return (
    <>
      {header}
      <CompanyProfileForm profile={profile.data} provinces={regions.data} />
    </>
  );
}

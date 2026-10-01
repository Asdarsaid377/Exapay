import { CloudOff } from "lucide-react";
import type { Metadata } from "next";

import { EmptyState } from "@/components/common/EmptyState";
import { FormSection } from "@/components/common/FormSection";
import { CompanyProfileForm } from "@/components/company/CompanyProfileForm";
import { MinimumWageAlertsForm } from "@/components/company/MinimumWageAlertsForm";
import { PageHeader } from "@/components/layout/PageHeader";
import { fetchCompanyProfile, fetchRegions } from "@/lib/api/company";
import { getSession } from "@/lib/auth/getSession";

export const metadata: Metadata = { title: "Profil usaha — Exapay" };

// Profil usaha aktif (feature 09) + sakelar peringatan upah minimum (khusus owner, bawaan mati). Proxy sudah membatasi ke
// owner/admin; API memeriksa ulang.
export default async function SettingsCompanyPage() {
  const [profile, regions, session] = await Promise.all([fetchCompanyProfile(), fetchRegions(), getSession()]);
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
      <FormSection
        title="Peringatan upah minimum"
        description="Opsional. Usaha mikro & kecil tidak wajib mengikuti upah minimum, jadi peringatan ini bawaannya mati."
      >
        <MinimumWageAlertsForm
          key={String(profile.data.minimumWageAlerts)}
          enabled={profile.data.minimumWageAlerts}
          canEdit={session?.activeTenant?.role === "owner"}
        />
      </FormSection>
    </>
  );
}

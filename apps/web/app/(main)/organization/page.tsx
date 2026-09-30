import { CloudOff } from "lucide-react";
import type { Metadata } from "next";

import { EmptyState } from "@/components/common/EmptyState";
import { PageHeader } from "@/components/layout/PageHeader";
import { OrgListCard } from "@/components/organization/OrgListCard";
import { fetchOrganization } from "@/lib/api/organization";

export const metadata: Metadata = { title: "Organisasi — Exapay" };

// Departemen & jabatan (feature 10). Owner/admin mengelola; atasan hanya melihat.
export default async function OrganizationPage() {
  const result = await fetchOrganization();
  const description = "Departemen dan jabatan untuk mengelompokkan karyawan. Template KPI nanti dibuat per jabatan.";

  if (!result.ok) {
    return (
      <>
        <PageHeader title="Organisasi" description={description} />
        <EmptyState icon={CloudOff} title="Data organisasi tidak dapat dimuat" description={result.error} />
      </>
    );
  }
  const { departments, positions, canManage } = result.data;

  return (
    <>
      <PageHeader title="Organisasi" description={canManage ? description : `${description} Hanya pemilik dan admin yang dapat mengubahnya.`} />
      <div className="grid items-start gap-4 lg:grid-cols-2 lg:gap-5">
        <OrgListCard kind="departments" items={departments} canManage={canManage} />
        <OrgListCard kind="positions" items={positions} canManage={canManage} />
      </div>
    </>
  );
}

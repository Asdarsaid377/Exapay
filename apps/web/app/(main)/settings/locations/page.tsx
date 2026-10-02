import { CloudOff } from "lucide-react";
import type { Metadata } from "next";

import { AddWorkLocationButton } from "@/components/attendance/AddWorkLocationButton";
import { WorkLocationList } from "@/components/attendance/WorkLocationList";
import { EmptyState } from "@/components/common/EmptyState";
import { PageHeader } from "@/components/layout/PageHeader";
import { fetchWorkLocations } from "@/lib/api/workLocations";

export const metadata: Metadata = { title: "Lokasi kerja — Exapay" };

const DESCRIPTION = "Absen di luar lokasi tetap diterima, tetapi diberi tanda untuk ditinjau.";

// Lokasi kerja usaha (feature 44, design context/designs/settings-locations.html). Proxy membatasi ke owner/admin; API memeriksa ulang.
export default async function SettingsLocationsPage() {
  const result = await fetchWorkLocations();
  if (!result.ok) {
    return (
      <>
        <PageHeader title="Lokasi kerja" description={DESCRIPTION} />
        <EmptyState icon={CloudOff} title="Lokasi kerja tidak dapat dimuat" description={result.error} />
      </>
    );
  }
  const overview = result.data;
  const empty = overview.items.length === 0;

  return (
    <>
      <PageHeader
        title="Lokasi kerja"
        description={DESCRIPTION}
        actions={empty ? null : <AddWorkLocationButton className="max-sm:h-12 max-sm:w-full max-sm:text-[15px]" />}
      />
      {empty ? (
        <EmptyState title="Belum ada lokasi kerja" description="Tanpa lokasi kerja, absen tidak dicek lokasinya." action={<AddWorkLocationButton size="lg" />} />
      ) : (
        <WorkLocationList overview={overview} />
      )}
    </>
  );
}

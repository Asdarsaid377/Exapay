import type { Metadata } from "next";

import { SessionPlaceholder } from "@/components/auth/SessionPlaceholder";

export const metadata: Metadata = { title: "Portal Karyawan — Exapay" };

// SEMENTARA (feature 04) — diganti di feature 14 & 37
export default function PortalPage() {
  return <SessionPlaceholder area="Portal Karyawan" replacedBy="feature 14 & 37" />;
}

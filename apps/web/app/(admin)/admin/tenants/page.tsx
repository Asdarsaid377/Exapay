import type { Metadata } from "next";

import { SessionPlaceholder } from "@/components/auth/SessionPlaceholder";

export const metadata: Metadata = { title: "Panel Super-admin — Exapay" };

// SEMENTARA (feature 04) — diganti di feature 07
export default function AdminTenantsPage() {
  return <SessionPlaceholder area="Panel Super-admin" replacedBy="feature 07" />;
}

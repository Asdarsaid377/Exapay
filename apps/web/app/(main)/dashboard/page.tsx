import type { Metadata } from "next";

import { SessionPlaceholder } from "@/components/auth/SessionPlaceholder";

export const metadata: Metadata = { title: "Dashboard — Exapay" };

// SEMENTARA (feature 04) — diganti di feature 06 (App Shell) & 35
export default function DashboardPage() {
  return <SessionPlaceholder area="Dashboard" replacedBy="feature 06 (App Shell) & 35" />;
}

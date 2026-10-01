"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

const POLL_MS = 3000;

// Muat ulang halaman berkala selama worker masih membuat PDF / mengirim email (pola KpiReviewSummaryPanel)
export function PayslipAutoRefresh({ active }: { active: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => router.refresh(), POLL_MS);
    return () => clearInterval(timer);
  }, [active, router]);
  return null;
}

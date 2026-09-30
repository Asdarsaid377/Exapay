import { ArrowLeft } from "lucide-react";
import Link from "next/link";

import { reviewsHref } from "@/lib/kpiReviewLabels";

type Props = {
  periodId: string | null;
};

// Tautan kembali ke daftar penilaian (periode yang sama) dari detail — pola KpiTemplatesBackLink
export function KpiReviewsBackLink({ periodId }: Props) {
  return (
    <Link href={reviewsHref(periodId)} className="inline-flex items-center gap-1.5 self-start px-1.5 text-sm font-bold text-accent-strong hover:text-accent-hover">
      <ArrowLeft aria-hidden className="size-4" />
      Penilaian KPI
    </Link>
  );
}

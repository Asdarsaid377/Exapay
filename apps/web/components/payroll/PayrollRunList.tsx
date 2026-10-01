import type { PayrollRunList as PayrollRunListData } from "@exapay/shared";
import { ChevronRight } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/common/Badge";
import { RUN_STATUS_LABELS, RUN_STATUS_TONES, runHref, runPeriodSummary, runTitle } from "@/lib/payrollRunLabels";

type Props = {
  runs: PayrollRunListData["runs"];
};

// Daftar periode gaji (feature 29), terbaru dulu — tiap baris membuka draf periode.
// Tanpa referensi desain — pola KpiReviewList (glass-data, baris Link) (izin user).
export function PayrollRunList({ runs }: Props) {
  return (
    <section className="overflow-hidden rounded-card glass-data">
      <ul>
        {runs.map((run) => (
          <li key={run.id} className="border-t border-border-subtle first:border-t-0">
            <Link
              href={runHref(run.id)}
              className="grid min-h-16 grid-cols-[minmax(0,1fr)_auto_1.25rem] items-center gap-x-4 px-4 py-3 transition-colors hover:bg-row-hover focus-visible:bg-row-hover focus-visible:outline-none sm:px-5"
            >
              <div className="flex min-w-0 flex-col">
                <span className="truncate text-[15px] font-bold text-text-primary">{runTitle(run)}</span>
                <span className="truncate text-caption text-text-tertiary tabular-nums">
                  {runPeriodSummary(run)}
                  {run.adjustmentCount > 0 ? ` · ${run.adjustmentCount} penyesuaian` : ""}
                </span>
              </div>
              <Badge tone={RUN_STATUS_TONES[run.status]}>{RUN_STATUS_LABELS[run.status]}</Badge>
              <ChevronRight aria-hidden className="size-5 text-text-secondary" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

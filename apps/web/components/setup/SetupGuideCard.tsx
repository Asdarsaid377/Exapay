"use client";

import type { SetupGuide } from "@exapay/shared";
import { ChevronDown, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import { markScheduleChecked } from "@/actions/setupGuide";
import { FormAlert } from "@/components/common/FormAlert";
import { SetupSkipDialog } from "@/components/setup/SetupSkipDialog";
import { SetupStepRow } from "@/components/setup/SetupStepRow";
import { SETUP_EXTRAS, setupStepContent } from "@/lib/setupGuideContent";

type Props = {
  guide: SetupGuide;
  tenantName: string;
};

const NETWORK_ERROR = "Tidak dapat terhubung ke server. Periksa koneksi Anda lalu coba lagi.";

// Kartu "Siapkan Exapay" di atas dashboard owner/admin (feature 48, snapshot context/designs/setup-guide.html).
// Desktop: kolom kiri judul + progres + Tambahan, kanan daftar langkah. Mobile: bertumpuk, Tambahan di bawah.
// Langkah berikutnya = langkah pertama yang belum selesai (langkah boleh selesai tidak berurutan).
export function SetupGuideCard({ guide, tenantName }: Props) {
  const router = useRouter();
  const extrasId = useId();
  const [extrasOpen, setExtrasOpen] = useState(false);
  const [skipOpen, setSkipOpen] = useState(false);
  const [marking, setMarking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nextKey = guide.steps.find((step) => !step.done)?.key ?? null;
  const percent = (guide.completedCount / guide.totalCount) * 100;

  async function handleMarkChecked() {
    setError(null);
    setMarking(true);
    try {
      const outcome = await markScheduleChecked();
      if (outcome.kind === "error") setError(outcome.message);
      else router.refresh();
    } catch {
      setError(NETWORK_ERROR);
    } finally {
      setMarking(false);
    }
  }

  return (
    <section
      aria-labelledby="setup-guide-title"
      className="glass-strong grid rounded-card px-4 pt-4.5 pb-1.5 [grid-template-areas:'head'_'steps'_'extras'] lg:grid-cols-[360px_minmax(0,1fr)] lg:grid-rows-[auto_1fr] lg:p-0 lg:[grid-template-areas:'head_steps'_'extras_steps']"
    >
      <div className="flex flex-col gap-3.5 [grid-area:head] lg:gap-4.5 lg:border-r lg:border-border-subtle lg:px-6 lg:pt-5.5">
        <div className="flex flex-col gap-1 lg:gap-1.5">
          <div className="flex items-center justify-between gap-2">
            <h2 id="setup-guide-title" className="font-display text-[19px] leading-[1.2] font-extrabold tracking-[-0.02em] text-text-primary lg:text-xl">
              Siapkan Exapay
            </h2>
            <button
              type="button"
              onClick={() => setSkipOpen(true)}
              className="-mr-2.5 h-11 shrink-0 rounded-full px-2.5 text-[13.5px] font-bold whitespace-nowrap text-text-secondary transition-colors hover:bg-text-primary/5 hover:text-text-primary focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-accent/45 lg:h-8.5"
            >
              Lewati panduan
            </button>
          </div>
          <p className="text-[13.5px] leading-normal text-pretty text-text-secondary lg:text-sm">Ikuti langkah ini sampai payroll pertama — ±20 menit.</p>
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-sm font-bold text-text-primary tabular-nums">
            {guide.completedCount} dari {guide.totalCount} langkah
          </span>
          <div
            role="progressbar"
            aria-label={`Panduan setup ${tenantName}`}
            aria-valuemin={0}
            aria-valuemax={guide.totalCount}
            aria-valuenow={guide.completedCount}
            className="h-1.5 overflow-hidden rounded-full bg-text-primary/8"
          >
            <div className="h-full rounded-full bg-accent transition-[width] duration-500 ease-exa-out" style={{ width: `${percent}%` }} />
          </div>
        </div>
      </div>

      <ol className="mt-1 flex flex-col [grid-area:steps] lg:mt-0 lg:px-6 lg:py-1.5">
        {guide.steps.map((step) => (
          <li key={step.key} className="border-t border-border-subtle first:border-t-0">
            <SetupStepRow
              step={step}
              content={setupStepContent(step.key, guide)}
              state={step.done ? "done" : step.key === nextKey ? "next" : "todo"}
              marking={marking}
              onMarkChecked={() => void handleMarkChecked()}
            />
          </li>
        ))}
        {error ? (
          <li className="pb-3">
            <FormAlert tone="danger">{error}</FormAlert>
          </li>
        ) : null}
      </ol>

      <div className="flex flex-col border-t border-border-subtle [grid-area:extras] lg:border-t-0 lg:border-r lg:px-6 lg:pt-4.5 lg:pb-6">
        <div className="lg:border-t lg:border-border-subtle lg:pt-1.5">
          <button
            type="button"
            onClick={() => setExtrasOpen((open) => !open)}
            aria-expanded={extrasOpen}
            aria-controls={extrasId}
            className="flex h-12 w-full items-center gap-2 text-left text-text-primary focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-accent/45 lg:h-10"
          >
            <span className="flex-1 text-sm font-bold">Tambahan (opsional)</span>
            <span className="text-[13px] text-text-tertiary">{SETUP_EXTRAS.length} pengaturan</span>
            <ChevronDown aria-hidden className={`size-4 shrink-0 text-text-secondary transition-transform duration-200 ${extrasOpen ? "rotate-180" : ""}`} />
          </button>
        </div>
        {extrasOpen ? (
          <ul id={extrasId} className="flex flex-col pb-2">
            {SETUP_EXTRAS.map((extra) => (
              <li key={extra.title}>
                <Link href={extra.href} className="flex min-h-11 items-center gap-2.5 py-2 text-text-primary transition-colors hover:text-accent-strong">
                  <span className="flex flex-1 flex-col gap-px">
                    <span className="text-sm font-bold">{extra.title}</span>
                    <span className="text-[13px] text-text-secondary">{extra.description}</span>
                  </span>
                  <ChevronRight aria-hidden className="size-4 shrink-0 text-text-tertiary" />
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <SetupSkipDialog open={skipOpen} onClose={() => setSkipOpen(false)} tenantName={tenantName} />
    </section>
  );
}

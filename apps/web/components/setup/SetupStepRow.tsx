"use client";

import type { SetupGuide } from "@exapay/shared";
import { Check, ChevronRight } from "lucide-react";
import Link from "next/link";

import { buttonClassName } from "@/components/common/Button";
import type { SetupStepContent } from "@/lib/setupGuideContent";

type Step = SetupGuide["steps"][number];

type Props = {
  step: Step;
  content: SetupStepContent;
  state: "done" | "next" | "todo";
  // Aksi "Tandai sudah dicek" (langkah jadwal kerja) sedang berjalan
  marking: boolean;
  onMarkChecked: () => void;
};

// Satu langkah panduan (design setup-components "SetupStepRow"): selesai (centang hijau, redup) · berikutnya (disorot:
// deskripsi, sub-progres, tombol primer + tautan sekunder) · belum (satu baris, seluruh baris tautan).
export function SetupStepRow({ step, content, state, marking, onMarkChecked }: Props) {
  if (state === "done") {
    return (
      <div className="flex min-h-12 items-center gap-3 lg:min-h-11.5 lg:gap-3.5">
        <span className="grid size-5.5 shrink-0 place-items-center rounded-full bg-success">
          <Check aria-hidden className="size-3.5 text-white" strokeWidth={3} />
        </span>
        <span className="flex-1 text-sm text-text-tertiary lg:text-[14.5px]">
          {content.title}
          <span className="sr-only"> — selesai</span>
        </span>
        <span aria-hidden className="hidden text-[13px] text-success lg:inline">
          Selesai
        </span>
      </div>
    );
  }

  if (state === "todo") {
    return (
      <Link
        href={content.href}
        className="group flex min-h-13 items-center gap-3 transition-colors hover:bg-text-primary/[0.025] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-accent/45 lg:min-h-12.5 lg:gap-3.5"
      >
        <span aria-hidden className="size-5.5 shrink-0 rounded-full border-[1.5px] border-text-primary/30" />
        <span className="flex-1 text-sm font-medium text-text-primary lg:text-[14.5px]">{content.title}</span>
        <span
          aria-hidden
          className="hidden h-8.5 items-center rounded-full border border-border-control bg-control px-3.5 font-display text-[13px] font-bold text-text-primary transition-colors group-hover:border-border-control-hover group-hover:bg-white lg:flex"
        >
          {content.action}
        </span>
        <span aria-hidden className="-mr-3 grid size-11 shrink-0 place-items-center lg:hidden">
          <ChevronRight className="size-4.5 text-text-secondary" />
        </span>
      </Link>
    );
  }

  const progress = step.progress && content.progressLabel ? step.progress : null;
  const percent = progress && progress.total > 0 ? (progress.done / progress.total) * 100 : 0;
  const secondary = content.secondary;
  return (
    <div className="flex flex-col gap-3 py-4 lg:flex-row lg:gap-3.5 lg:pt-4.5 lg:pb-5">
      <div className="flex gap-3 lg:contents">
        <span aria-hidden className="mt-px size-5.5 shrink-0 rounded-full border-2 border-accent" />
        <div className="flex flex-1 flex-col gap-1 lg:gap-3">
          <div className="flex flex-col gap-1">
            <span className="font-display text-[15.5px] leading-[1.35] font-bold text-text-primary lg:text-base">{content.title}</span>
            <span className="max-w-140 text-[13.5px] leading-normal text-pretty text-text-secondary lg:text-sm">{content.description}</span>
          </div>
          {progress && content.progressLabel ? (
            <div className="flex flex-col gap-1.5 pt-1.5 lg:flex-row-reverse lg:items-center lg:justify-end lg:gap-3 lg:pt-0">
              <span className="text-[13.5px] font-medium text-text-primary tabular-nums">{content.progressLabel(progress.done, progress.total)}</span>
              <div
                role="progressbar"
                aria-label={content.progressLabel(progress.done, progress.total)}
                aria-valuemin={0}
                aria-valuemax={progress.total}
                aria-valuenow={progress.done}
                className="h-1.5 overflow-hidden rounded-full bg-text-primary/8 lg:w-35"
              >
                <div className="h-full rounded-full bg-inverse" style={{ width: `${percent}%` }} />
              </div>
            </div>
          ) : null}
          <div className="hidden items-center gap-4.5 lg:flex">
            <Link href={content.href} className={buttonClassName({ className: "h-10.5 px-5 text-sm" })}>
              {content.action}
            </Link>
            {secondary ? <SecondaryAction secondary={secondary} marking={marking} onMarkChecked={onMarkChecked} /> : null}
          </div>
        </div>
      </div>
      {/* Mobile: tombol selebar kartu */}
      <div className="flex flex-col lg:hidden">
        <Link href={content.href} className={buttonClassName({ fullWidth: true, className: "h-12 text-[15px]" })}>
          {content.action}
        </Link>
        {secondary ? (
          <div className="mt-0.5 flex justify-center">
            <SecondaryAction secondary={secondary} marking={marking} onMarkChecked={onMarkChecked} fullWidth />
          </div>
        ) : null}
      </div>
    </div>
  );
}

const SECONDARY =
  "flex h-11 items-center justify-center text-sm font-bold text-accent-strong transition-colors hover:text-accent-hover hover:underline focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-accent/45 disabled:opacity-60 lg:h-10.5";

function SecondaryAction(props: { secondary: NonNullable<SetupStepContent["secondary"]>; marking: boolean; onMarkChecked: () => void; fullWidth?: boolean }) {
  const { secondary, marking, onMarkChecked, fullWidth = false } = props;
  const width = fullWidth ? "w-full" : "";
  if ("href" in secondary) {
    return (
      <Link href={secondary.href} className={`${SECONDARY} ${width}`}>
        {secondary.label}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onMarkChecked} disabled={marking} className={`${SECONDARY} ${width}`}>
      {marking ? "Menyimpan…" : secondary.label}
    </button>
  );
}

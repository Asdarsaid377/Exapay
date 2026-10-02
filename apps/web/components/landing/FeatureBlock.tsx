import type { ReactNode } from "react";

import { FeaturePoints } from "@/components/landing/FeaturePoints";

type Props = {
  title: string;
  description: string;
  points: readonly string[];
  preview: ReactNode;
  // Cuplikan di kiri (desktop) — blok fitur selang-seling
  previewFirst?: boolean;
  // Cuplikan disembunyikan di mobile (desain mobile hanya menampilkan sebagian cuplikan)
  previewDesktopOnly?: boolean;
};

// Satu blok fitur landing: teks + cuplikan UI berdampingan (desktop), bertumpuk (mobile)
export function FeatureBlock({ title, description, points, preview, previewFirst = false, previewDesktopOnly = false }: Props) {
  return (
    <div className="grid items-center gap-4 lg:grid-cols-2 lg:gap-18">
      <div className={`flex flex-col gap-4 lg:gap-5 ${previewFirst ? "lg:order-2" : ""}`}>
        <h3 className="font-display text-[23px] leading-[1.2] font-extrabold tracking-[-0.02em] lg:text-feature">{title}</h3>
        <p className="text-[15.5px] leading-[1.55] text-pretty text-text-secondary lg:text-[17px]">{description}</p>
        <FeaturePoints points={points} />
      </div>
      <div className={`${previewDesktopOnly ? "hidden lg:block" : ""} ${previewFirst ? "lg:order-1" : ""}`}>{preview}</div>
    </div>
  );
}

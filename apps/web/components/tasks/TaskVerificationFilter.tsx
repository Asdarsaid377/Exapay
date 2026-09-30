"use client";

import type { TaskVerificationFilter as Filter } from "@exapay/shared";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { SegmentedControl } from "@/components/common/SegmentedControl";
import { taskVerificationHref } from "@/lib/taskVerificationLabels";

type Props = {
  value: Filter;
  pendingCount: number;
};

// Filter status verifikasi (di URL ?status=) — pola LeaveRequestFilter. Kontrol dikunci selama halaman baru dimuat.
export function TaskVerificationFilter({ value, pendingCount }: Props) {
  const router = useRouter();
  const [loading, startTransition] = useTransition();
  const options = [
    { value: "pending", label: pendingCount > 0 ? `Menunggu (${pendingCount})` : "Menunggu" },
    { value: "approved", label: "Disetujui" },
    { value: "rejected", label: "Ditolak" },
    { value: "all", label: "Semua" },
  ] as const;

  return (
    <div className="max-sm:overflow-x-auto">
      <SegmentedControl
        label="Status catatan"
        options={options}
        value={value}
        disabled={loading}
        onChange={(next: Filter) => startTransition(() => router.push(taskVerificationHref(next), { scroll: false }))}
      />
    </div>
  );
}

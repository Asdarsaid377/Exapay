"use client";

import type { TaskVerificationItem } from "@exapay/shared";
import { useRouter } from "next/navigation";
import { type ReactNode, useState } from "react";

import { approveTaskLogs } from "@/actions/taskVerification";
import { Button } from "@/components/common/Button";
import { Checkbox } from "@/components/common/Checkbox";
import { FormAlert } from "@/components/common/FormAlert";
import { EmployeeAvatar } from "@/components/employees/EmployeeAvatar";
import { TaskVerificationRow } from "@/components/tasks/TaskVerificationRow";
import { longDate } from "@/lib/taskLogLabels";
import { groupByEmployeeDay } from "@/lib/taskVerificationLabels";

type Props = {
  items: TaskVerificationItem[];
  timeZone: string;
  // Filter Menunggu → checkbox & bilah "Setujui sekaligus"
  bulk: boolean;
  footer?: ReactNode;
};

type Result = { tone: "success" | "danger"; message: string };

function resultMessage(approved: number, skipped: number): string {
  const done = `${approved} catatan disetujui.`;
  return skipped > 0 ? `${done} ${skipped} dilewati karena sudah diputuskan, dihapus, atau diubah karyawan — periksa lagi.` : done;
}

// Catatan tugas dikelompokkan per karyawan + tanggal (card glass-data), baris TaskVerificationRow.
// Setujui sekaligus: centang catatan menunggu → satu permintaan; tolak & koreksi tetap satu per satu.
// Tanpa referensi desain — pola LeaveRequestTable + action bar EmployeeForm (feature 20, izin user).
export function TaskVerificationList({ items, timeZone, bulk, footer }: Props) {
  const router = useRouter();
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  const selectable = bulk ? items.filter((item) => item.canDecide) : [];
  // Pilihan yang masih ada di daftar (daftar berubah setelah refresh)
  const chosen = selectable.filter((item) => selected.has(item.id));
  const allChosen = selectable.length > 0 && chosen.length === selectable.length;

  function setMany(ids: string[], checked: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      for (const id of ids) {
        if (checked) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }

  async function approveChosen() {
    if (chosen.length === 0) return;
    setResult(null);
    setSubmitting(true);
    try {
      const outcome = await approveTaskLogs({ items: chosen.map((item) => ({ id: item.id, version: item.version })) });
      if (outcome.kind === "error") {
        setResult({ tone: "danger", message: outcome.message });
        return;
      }
      setSelected(new Set());
      setResult({ tone: "success", message: resultMessage(outcome.approved, outcome.skipped) });
      router.refresh();
    } catch {
      setResult({ tone: "danger", message: "Tidak dapat terhubung ke server. Periksa koneksi Anda lalu coba lagi." });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 lg:gap-4">
      {result ? <FormAlert tone={result.tone}>{result.message}</FormAlert> : null}
      <ul className="flex flex-col gap-3 lg:gap-4">
        {groupByEmployeeDay(items).map((group) => {
          const groupIds = group.items.filter((item) => bulk && item.canDecide).map((item) => item.id);
          const groupChosen = groupIds.length > 0 && groupIds.every((id) => selected.has(id));
          const pending = group.items.filter((item) => item.status === "pending").length;
          return (
            <li key={group.key} className="glass-data flex flex-col rounded-card pb-1">
              <div className="flex items-center gap-3 px-4.5 pt-4 pb-3.5 lg:px-6">
                {groupIds.length > 0 ? (
                  <label className="-my-2.5 -ml-2.5 flex size-11 shrink-0 cursor-pointer items-center justify-center">
                    <Checkbox
                      aria-label={`Pilih semua catatan ${group.employee.fullName} ${longDate(group.workDate)}`}
                      checked={groupChosen}
                      onChange={(e) => setMany(groupIds, e.target.checked)}
                      disabled={submitting}
                    />
                  </label>
                ) : null}
                <EmployeeAvatar fullName={group.employee.fullName} size="md" />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-[15px] font-bold text-text-primary">{group.employee.fullName}</span>
                  <span className="text-small text-pretty text-text-secondary">
                    {group.employee.positionName} · {longDate(group.workDate)}
                  </span>
                </div>
                {pending > 0 ? <span className="shrink-0 text-caption text-text-tertiary tabular-nums">{pending} menunggu</span> : null}
              </div>
              <ul>
                {group.items.map((item) => (
                  <TaskVerificationRow
                    key={item.id}
                    item={item}
                    timeZone={timeZone}
                    selectable={bulk && item.canDecide}
                    selected={selected.has(item.id)}
                    onSelect={(id, checked) => setMany([id], checked)}
                  />
                ))}
              </ul>
            </li>
          );
        })}
      </ul>
      {footer ? <div className="px-1.5">{footer}</div> : null}

      {selectable.length > 0 ? (
        <div className="glass-data sticky bottom-2.5 z-10 flex items-center justify-between gap-2.5 rounded-[26px] p-2 pl-2.5 lg:rounded-card lg:py-3 lg:pr-3 lg:pl-4">
          <label className="flex min-h-11 min-w-0 cursor-pointer items-center gap-3 px-2">
            <Checkbox checked={allChosen} onChange={(e) => setMany(selectable.map((item) => item.id), e.target.checked)} disabled={submitting} />
            <span className="text-[14.5px] font-bold text-text-primary tabular-nums">
              {chosen.length > 0 ? `${chosen.length} dipilih` : `Pilih semua (${selectable.length})`}
            </span>
          </label>
          <Button size="lg" className="shrink-0 max-sm:px-5 lg:h-11" onClick={approveChosen} loading={submitting} disabled={chosen.length === 0}>
            {submitting ? "Menyetujui…" : chosen.length > 0 ? `Setujui ${chosen.length}` : "Setujui"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

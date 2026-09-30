import { TASK_LOG_STATUS_LABELS, type TaskVerificationItem } from "@exapay/shared";

import { Badge } from "@/components/common/Badge";
import { Checkbox } from "@/components/common/Checkbox";
import { TaskDecisionActions } from "@/components/tasks/TaskDecisionActions";
import { formatClockTime } from "@/lib/attendanceLabels";
import { formatQuantity, TASK_STATUS_TONES, targetLabel } from "@/lib/taskLogLabels";
import { isCorrected, itemQuantity, itemTitle, verificationPhotoHref } from "@/lib/taskVerificationLabels";

type Props = {
  item: TaskVerificationItem;
  timeZone: string;
  // Tampilkan checkbox pilih (filter Menunggu & bisa diputuskan)
  selectable: boolean;
  selected: boolean;
  onSelect: (id: string, selected: boolean) => void;
};

// Keputusan yang sudah diambil / alasan tidak ada aksi
function DecisionNote({ item }: { item: TaskVerificationItem }) {
  if (item.status === "pending") {
    return item.canDecide ? null : <span className="text-small text-text-secondary">Catatan Anda — diverifikasi atasan Anda atau pemilik/admin lain</span>;
  }
  const verb = item.status === "rejected" ? "Ditolak" : isCorrected(item) ? "Dikoreksi" : "Disetujui";
  return (
    <span className={`text-small text-pretty break-words ${item.status === "rejected" ? "text-danger-text" : "text-text-secondary"}`}>
      {verb}
      {item.decidedByName ? ` oleh ${item.decidedByName}` : ""}
      {item.decisionNote ? `: ${item.decisionNote}` : ""}
    </span>
  );
}

// Satu catatan tugas di kelompok karyawan + tanggal: jam catat, indikator/pekerjaan lain, realisasi (koreksi dicoret → angka baru),
// catatan, foto, keputusan/aksi. Tanpa referensi desain — pola TaskLogList + LeaveRequestTable (feature 20, izin user).
export function TaskVerificationRow({ item, timeZone, selectable, selected, onSelect }: Props) {
  const quantity = itemQuantity(item);
  const corrected = isCorrected(item);
  const title = itemTitle(item);
  return (
    <li className="flex gap-3 border-t border-border-subtle px-4.5 py-3.5 lg:px-6">
      {selectable ? (
        <label className="-my-2.5 -ml-2.5 flex size-11 shrink-0 cursor-pointer items-center justify-center">
          <Checkbox aria-label={`Pilih ${title}${quantity ? ` ${quantity}` : ""}`} checked={selected} onChange={(e) => onSelect(item.id, e.target.checked)} />
        </label>
      ) : null}
      <time dateTime={item.createdAt} className="w-11 shrink-0 pt-0.5 font-display text-[15px] font-extrabold text-text-primary tabular-nums">
        {formatClockTime(item.createdAt, timeZone)}
      </time>
      <div className="flex min-w-0 flex-1 flex-col gap-3 lg:flex-row lg:items-start lg:justify-between lg:gap-6">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex items-start justify-between gap-2">
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="text-[14.5px] font-bold text-text-primary">{title}</span>
              {quantity && item.indicator ? (
                <span className="flex flex-wrap items-baseline gap-x-2 font-display text-[15px] font-extrabold text-text-primary tabular-nums">
                  {corrected && item.verifiedQuantity ? (
                    <>
                      <s className="font-bold text-text-tertiary">{formatQuantity(item.quantity ?? "")}</s>
                      <span>
                        {formatQuantity(item.verifiedQuantity)} {item.indicator.unit}
                      </span>
                    </>
                  ) : (
                    quantity
                  )}
                </span>
              ) : null}
              {item.indicator ? (
                <span className="text-caption text-text-tertiary">{targetLabel(item.indicator.target, item.indicator.unit, item.indicator.targetPeriod)}</span>
              ) : null}
            </div>
            {item.status !== "pending" || !item.canDecide ? (
              <Badge tone={TASK_STATUS_TONES[item.status]}>{corrected ? "Dikoreksi" : TASK_LOG_STATUS_LABELS[item.status]}</Badge>
            ) : null}
          </div>
          {item.note ? <p className="text-small text-pretty break-words text-text-primary">{item.note}</p> : null}
          {item.photo ? (
            <a
              href={verificationPhotoHref(item.id, item.updatedAt)}
              target="_blank"
              rel="noopener"
              className="mt-1 w-fit rounded-inner focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-accent/45"
            >
              {/* Foto privat lewat Route Handler — next/image tidak dipakai */}
              <img
                src={verificationPhotoHref(item.id, item.updatedAt)}
                alt={`Foto bukti ${title}`}
                loading="lazy"
                className="size-20 rounded-inner border border-border-subtle object-cover"
              />
            </a>
          ) : null}
          {item.editedAt ? <span className="text-caption text-text-tertiary">Diubah karyawan {formatClockTime(item.editedAt, timeZone)}</span> : null}
          <DecisionNote item={item} />
        </div>
        {item.canDecide ? (
          <div className="shrink-0">
            <TaskDecisionActions item={item} />
          </div>
        ) : null}
      </div>
    </li>
  );
}

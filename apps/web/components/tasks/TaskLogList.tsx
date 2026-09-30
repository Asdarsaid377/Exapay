import { type TaskIndicatorDay, type TaskLog, TASK_LOG_STATUS_LABELS } from "@exapay/shared";

import { Badge } from "@/components/common/Badge";
import { TaskLogActions } from "@/components/tasks/TaskLogActions";
import { formatClockTime } from "@/lib/attendanceLabels";
import { formatQuantity, myTaskPhotoHref, TASK_STATUS_TONES } from "@/lib/taskLogLabels";

type Props = {
  logs: TaskLog[];
  indicators: TaskIndicatorDay[];
  timeZone: string;
};

function titleOf(log: TaskLog): string {
  return log.indicator?.name ?? "Pekerjaan lain";
}

function quantityOf(log: TaskLog): string | null {
  return log.indicator && log.quantity ? `${formatQuantity(log.quantity)} ${log.indicator.unit}` : null;
}

// Catatan tugas satu tanggal milik sendiri, terbaru di atas: jam catat + indikator/pekerjaan lain + realisasi + catatan
// + foto + status. Tanpa referensi desain — pola MyLeaveRequestList (card solid, baris berpemisah) (feature 19, izin user).
export function TaskLogList({ logs, indicators, timeZone }: Props) {
  return (
    <section aria-labelledby="task-log-list-title" className="surface-solid flex flex-col rounded-card px-4.5 pt-4.5 pb-1.5">
      <h2 id="task-log-list-title" className="mb-1 font-display text-[17px] font-bold tracking-[-0.01em] text-text-primary">
        Catatan
      </h2>
      {logs.length === 0 ? (
        <p className="pt-1 pb-4 text-sm text-text-secondary">Belum ada tugas yang dicatat di tanggal ini.</p>
      ) : (
        <ul>
          {logs.map((log) => {
            const quantity = quantityOf(log);
            const edited = log.updatedAt !== log.createdAt;
            return (
              <li key={log.id} className="flex gap-3.5 border-t border-border-subtle py-3.5 first:border-t-0">
                <time dateTime={log.createdAt} className="w-11 shrink-0 pt-0.5 font-display text-[15px] font-extrabold text-text-primary tabular-nums">
                  {formatClockTime(log.createdAt, timeZone)}
                </time>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <span className="text-[14.5px] font-bold text-text-primary">{titleOf(log)}</span>
                      {quantity ? <span className="font-display text-[15px] font-extrabold text-text-primary tabular-nums">{quantity}</span> : null}
                    </div>
                    <Badge tone={TASK_STATUS_TONES[log.status]}>{TASK_LOG_STATUS_LABELS[log.status]}</Badge>
                  </div>
                  {log.note ? <p className="text-small text-pretty break-words text-text-primary">{log.note}</p> : null}
                  {log.photo ? (
                    <a
                      href={myTaskPhotoHref(log.id, log.updatedAt)}
                      target="_blank"
                      rel="noopener"
                      className="mt-1 w-fit rounded-inner focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-accent/45"
                    >
                      {/* Foto privat lewat Route Handler — next/image tidak dipakai */}
                      <img src={myTaskPhotoHref(log.id, log.updatedAt)} alt={`Foto bukti ${titleOf(log)}`} loading="lazy" className="size-20 rounded-inner border border-border-subtle object-cover" />
                    </a>
                  ) : null}
                  {edited || log.editable ? (
                    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                      <span className="text-caption text-text-tertiary">{edited ? `Diubah ${formatClockTime(log.updatedAt, timeZone)}` : ""}</span>
                      {log.editable ? <TaskLogActions log={log} indicators={indicators} summary={[titleOf(log), quantity].filter(Boolean).join(" · ")} /> : null}
                    </div>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

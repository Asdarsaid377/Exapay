import { LEAVE_REQUEST_STATUS_LABELS, LEAVE_TYPE_LABELS, type LeaveRequest } from "@exapay/shared";
import { Paperclip } from "lucide-react";

import { CalendarDate } from "@/components/attendance/CalendarDate";
import { CancelLeaveRequestButton } from "@/components/attendance/CancelLeaveRequestButton";
import { Badge } from "@/components/common/Badge";
import { formatDateRange, LEAVE_STATUS_TONES, myAttachmentHref, workingDaysLabel } from "@/lib/leaveLabels";

type Props = {
  requests: LeaveRequest[];
};

function Decision({ request }: { request: LeaveRequest }) {
  const by = request.decidedByName ? ` oleh ${request.decidedByName}` : "";
  if (request.status === "rejected")
    return (
      <p className="text-small text-danger-text">
        Ditolak{by}
        {request.decisionNote ? `: ${request.decisionNote}` : ""}
      </p>
    );
  if (request.status === "approved")
    return (
      <p className="text-small text-text-secondary">
        Disetujui{by}
        {request.decisionNote ? `: ${request.decisionNote}` : ""}
      </p>
    );
  return null;
}

// Pengajuan izin/sakit/cuti milik sendiri (portal). Card solid (portal maks 3 lapisan blur), pola baris AttendanceHistoryList.
export function MyLeaveRequestList({ requests }: Props) {
  return (
    <section aria-labelledby="my-leave-requests-title" className="surface-solid flex flex-col rounded-card px-4.5 pt-4.5 pb-1.5">
      <h2 id="my-leave-requests-title" className="mb-1 font-display text-[17px] font-bold tracking-[-0.01em] text-text-primary">
        Pengajuan saya
      </h2>
      {requests.length === 0 ? (
        <p className="pt-1 pb-4 text-sm text-text-secondary">Belum ada pengajuan izin, sakit, atau cuti di bulan ini.</p>
      ) : (
        <ul>
          {requests.map((request) => {
            const range = formatDateRange(request.startDate, request.endDate);
            return (
              <li key={request.id} className="flex gap-3.5 border-t border-border-subtle py-3.5 first:border-t-0">
                <CalendarDate date={request.startDate} muted={request.status === "cancelled" || request.status === "rejected"} />
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <span className="text-[14.5px] font-bold text-text-primary">
                        {LEAVE_TYPE_LABELS[request.type]} · {workingDaysLabel(request.workingDays)}
                      </span>
                      <span className="text-small text-text-secondary tabular-nums">{range}</span>
                    </div>
                    <Badge tone={LEAVE_STATUS_TONES[request.status]}>{LEAVE_REQUEST_STATUS_LABELS[request.status]}</Badge>
                  </div>
                  <p className="text-small text-pretty break-words text-text-primary">{request.reason}</p>
                  <Decision request={request} />
                  {request.attachment || request.status === "pending" ? (
                    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                      {request.attachment ? (
                        <a
                          href={myAttachmentHref(request.id)}
                          target="_blank"
                          rel="noopener"
                          className="-my-2 inline-flex min-h-11 min-w-0 items-center gap-1.5 text-sm font-bold text-accent-strong hover:text-accent-hover hover:underline focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-accent/45"
                        >
                          <Paperclip aria-hidden className="size-4 shrink-0" />
                          <span className="truncate">{request.attachment.name}</span>
                        </a>
                      ) : (
                        <span />
                      )}
                      {request.status === "pending" ? (
                        <CancelLeaveRequestButton id={request.id} summary={`${LEAVE_TYPE_LABELS[request.type]} · ${range}`} />
                      ) : null}
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

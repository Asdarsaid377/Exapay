import { LEAVE_REQUEST_STATUS_LABELS, LEAVE_TYPE_LABELS, type LeaveRequestListItem } from "@exapay/shared";
import { Paperclip } from "lucide-react";
import type { ReactNode } from "react";

import { LeaveDecisionActions } from "@/components/attendance/LeaveDecisionActions";
import { Badge } from "@/components/common/Badge";
import { EmployeeAvatar } from "@/components/employees/EmployeeAvatar";
import { formatDateRange, LEAVE_STATUS_TONES, staffAttachmentHref, workingDaysLabel } from "@/lib/leaveLabels";

type Props = {
  requests: LeaveRequestListItem[];
  footer?: ReactNode;
};

const HEAD = "px-4 whitespace-nowrap text-left text-caption font-bold text-text-secondary first:pl-5 last:pr-5";
const CELL = "px-4 py-3.5 align-top first:pl-5 last:pr-5";

function AttachmentLink({ request }: { request: LeaveRequestListItem }) {
  if (!request.attachment) return null;
  return (
    <a
      href={staffAttachmentHref(request.id)}
      target="_blank"
      rel="noopener"
      className="inline-flex min-w-0 items-center gap-1.5 self-start text-small font-bold text-accent-strong hover:text-accent-hover hover:underline focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-accent/45"
    >
      <Paperclip aria-hidden className="size-3.75 shrink-0" />
      <span className="truncate">{request.attachment.name}</span>
    </a>
  );
}

// Keputusan yang sudah diambil / alasan tidak ada aksi
function DecisionNote({ request }: { request: LeaveRequestListItem }) {
  if (request.status === "pending")
    return request.canDecide ? null : <span className="text-small text-text-secondary">Pengajuan Anda — diputuskan pemilik atau admin lain</span>;
  if (request.status === "cancelled") return <span className="text-small text-text-secondary">Dibatalkan karyawan</span>;
  const verb = request.status === "approved" ? "Disetujui" : "Ditolak";
  return (
    <span className="text-small text-pretty break-words text-text-secondary">
      {verb}
      {request.decidedByName ? ` oleh ${request.decidedByName}` : ""}
      {request.decisionNote ? `: ${request.decisionNote}` : ""}
    </span>
  );
}

// Daftar persetujuan izin/sakit/cuti — pola EmployeeTable (desktop tabel glass-data, mobile card).
// Tanpa referensi desain (feature 15, izin user).
export function LeaveRequestTable({ requests, footer }: Props) {
  return (
    <>
      <section className="hidden overflow-hidden rounded-card glass-data lg:block">
        <table className="w-full table-fixed">
          <thead className="bg-table-head">
            <tr className="h-11 border-b border-border-subtle">
              <th scope="col" className={`${HEAD} w-[23%]`}>
                Karyawan
              </th>
              <th scope="col" className={`${HEAD} w-[20%]`}>
                Jenis · Tanggal
              </th>
              <th scope="col" className={HEAD}>
                Alasan
              </th>
              <th scope="col" className={`${HEAD} w-[24%]`}>
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            {requests.map((request) => (
              <tr key={request.id} className="border-t border-border-subtle/90 text-text-primary first:border-t-0">
                <td className={CELL}>
                  <div className="flex min-w-0 items-center gap-3">
                    <EmployeeAvatar fullName={request.employee.fullName} />
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate text-[14.5px] font-bold">{request.employee.fullName}</span>
                      <span className="truncate text-caption text-text-tertiary">{request.employee.positionName}</span>
                    </div>
                  </div>
                </td>
                <td className={CELL}>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[14.5px] font-bold">{LEAVE_TYPE_LABELS[request.type]}</span>
                    <span className="text-small text-text-secondary tabular-nums">{formatDateRange(request.startDate, request.endDate)}</span>
                    <span className="text-caption text-text-tertiary">{workingDaysLabel(request.workingDays)}</span>
                  </div>
                </td>
                <td className={CELL}>
                  <div className="flex min-w-0 flex-col gap-1.5">
                    <p className="line-clamp-3 text-sm text-pretty break-words">{request.reason}</p>
                    <AttachmentLink request={request} />
                  </div>
                </td>
                <td className={CELL}>
                  <div className="flex flex-col items-start gap-2">
                    <Badge tone={LEAVE_STATUS_TONES[request.status]}>{LEAVE_REQUEST_STATUS_LABELS[request.status]}</Badge>
                    {request.canDecide ? <LeaveDecisionActions request={request} /> : <DecisionNote request={request} />}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {footer ? <div className="border-t border-border-subtle px-5 py-3">{footer}</div> : null}
      </section>

      <div className="flex flex-col gap-3 lg:hidden">
        <ul className="flex flex-col gap-3">
          {requests.map((request) => (
            <li key={request.id} className="glass-data flex flex-col gap-3 rounded-[20px] px-4 py-3.5 text-text-primary">
              <div className="flex items-center gap-3">
                <EmployeeAvatar fullName={request.employee.fullName} size="md" />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-[15px] font-bold">{request.employee.fullName}</span>
                  <span className="truncate text-[13px] text-text-secondary">{request.employee.positionName}</span>
                </div>
                <Badge tone={LEAVE_STATUS_TONES[request.status]}>{LEAVE_REQUEST_STATUS_LABELS[request.status]}</Badge>
              </div>
              <div className="flex flex-col gap-1.5 border-t border-border-subtle pt-3">
                <div className="flex flex-col gap-0.5">
                  <span className="text-[14.5px] font-bold">{LEAVE_TYPE_LABELS[request.type]}</span>
                  <span className="text-small text-text-secondary tabular-nums">
                    {formatDateRange(request.startDate, request.endDate)} · {workingDaysLabel(request.workingDays)}
                  </span>
                </div>
                <p className="text-sm text-pretty break-words">{request.reason}</p>
                <AttachmentLink request={request} />
                {request.canDecide ? null : <DecisionNote request={request} />}
              </div>
              {request.canDecide ? <LeaveDecisionActions request={request} fullWidth /> : null}
            </li>
          ))}
        </ul>
        {footer ? <div className="px-1.5">{footer}</div> : null}
      </div>
    </>
  );
}

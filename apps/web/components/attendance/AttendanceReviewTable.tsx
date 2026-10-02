import type { AttendanceReviewItem } from "@exapay/shared";
import type { ReactNode } from "react";

import { AttendanceFlag } from "@/components/attendance/AttendanceFlag";
import { AttendanceReviewActions } from "@/components/attendance/AttendanceReviewActions";
import { EmployeeAvatar } from "@/components/employees/EmployeeAvatar";
import { formatIsoDate } from "@/lib/datetime";
import { eventLabel } from "@/lib/workLocationLabels";

type Props = {
  items: AttendanceReviewItem[];
  timeZone: string;
  // Kolom terakhir: kosong saat filter "Perlu ditinjau" (isi tombol), "Keputusan" selain itu
  decisionHeading: boolean;
  // Tautan koreksi per item — null untuk atasan
  correctionHrefFor: (item: AttendanceReviewItem) => string | null;
  footer?: ReactNode;
};

const HEAD = "px-4 text-left text-caption font-bold whitespace-nowrap text-text-secondary first:pl-5 last:pr-5";
const CELL = "px-4 py-3 first:pl-5 last:pr-5";

// Antrean tinjauan absen bertanda (design attendance-review): tabel kaca di desktop, card di mobile.
// Satu baris per absen masuk/pulang bertanda.
export function AttendanceReviewTable({ items, timeZone, decisionHeading, correctionHrefFor, footer }: Props) {
  const key = (item: AttendanceReviewItem): string => `${item.recordId}-${item.event}`;
  return (
    <>
      <section className="hidden rounded-card glass-data lg:block">
        <table className="w-full table-fixed">
          <thead>
            <tr className="h-11 border-b border-border-subtle bg-table-head">
              <th scope="col" className={`${HEAD} w-[24%] rounded-tl-card`}>
                Karyawan
              </th>
              <th scope="col" className={`${HEAD} w-28`}>
                Tanggal
              </th>
              <th scope="col" className={`${HEAD} w-30`}>
                Absen
              </th>
              <th scope="col" className={HEAD}>
                Tanda
              </th>
              <th scope="col" className={`${HEAD} w-75 rounded-tr-card`}>
                {decisionHeading ? "Keputusan" : <span className="sr-only">Aksi</span>}
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={key(item)} className="h-19 border-t border-border-subtle/90 text-text-primary first:border-t-0">
                <td className={CELL}>
                  <div className="flex min-w-0 items-center gap-3">
                    <EmployeeAvatar fullName={item.employee.fullName} />
                    <div className="flex min-w-0 flex-col gap-px">
                      <span className="truncate text-[14.5px] font-bold">{item.employee.fullName}</span>
                      <span className="truncate text-caption text-text-tertiary">{item.employee.positionName}</span>
                    </div>
                  </div>
                </td>
                <td className={`${CELL} text-sm tabular-nums`}>{formatIsoDate(item.workDate)}</td>
                <td className={`${CELL} text-sm font-medium tabular-nums`}>{eventLabel(item.event, item.at, timeZone)}</td>
                <td className={CELL}>
                  <AttendanceFlag flag={item.flag} />
                </td>
                <td className={CELL}>
                  <AttendanceReviewActions item={item} timeZone={timeZone} correctionHref={correctionHrefFor(item)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {footer ? <div className="border-t border-border-subtle px-5 py-3">{footer}</div> : null}
      </section>

      <div className="flex flex-col gap-3 lg:hidden">
        <ul className="flex flex-col gap-3">
          {items.map((item) => (
            <li key={key(item)} className="glass-data flex flex-col gap-3 rounded-card p-4 text-text-primary">
              <div className="flex items-center gap-3">
                <EmployeeAvatar fullName={item.employee.fullName} size="md" />
                <div className="flex min-w-0 flex-1 flex-col gap-px">
                  <span className="truncate text-[15px] font-bold">{item.employee.fullName}</span>
                  <span className="truncate text-[13px] text-text-tertiary">{item.employee.positionName}</span>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-px">
                  <span className="text-sm font-bold tabular-nums">{eventLabel(item.event, item.at, timeZone)}</span>
                  <span className="text-caption text-text-secondary tabular-nums">{formatIsoDate(item.workDate)}</span>
                </div>
              </div>
              <div className="border-t border-border-subtle/90 pt-2.5">
                <AttendanceFlag flag={item.flag} />
              </div>
              <AttendanceReviewActions item={item} timeZone={timeZone} correctionHref={correctionHrefFor(item)} fullWidth />
            </li>
          ))}
        </ul>
        {footer ? <div className="px-1.5">{footer}</div> : null}
      </div>
    </>
  );
}

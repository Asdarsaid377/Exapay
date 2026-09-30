import type { AttendanceRecapRow } from "@exapay/shared";
import { ChevronRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { EmployeeAvatar } from "@/components/employees/EmployeeAvatar";
import { formatDuration } from "@/lib/attendanceLabels";

type Props = {
  rows: AttendanceRecapRow[];
  // Tautan rincian & koreksi per karyawan (owner/admin); null = atasan (hanya baca)
  detailHref: ((employeeId: string) => string) | null;
  footer?: ReactNode;
};

const HEAD = "px-3 whitespace-nowrap text-caption font-bold text-text-secondary first:pl-5 first:text-left last:pr-5";
const CELL = "px-3 py-3 text-center first:pl-5 first:text-left last:pr-5";

// Angka rekap: nol diredupkan; alpa/tanpa pulang > 0 berwarna status (warna lewat teks, bukan permukaan)
function Count({ value, tone = "default" }: { value: number; tone?: "default" | "danger" | "warning" }) {
  const color = value === 0 ? "text-text-tertiary" : tone === "danger" ? "text-danger-text" : tone === "warning" ? "text-warning-text" : "text-text-primary";
  return <span className={`font-display text-[17px] font-bold tabular-nums ${color}`}>{value}</span>;
}

function EmployeeCell({ row }: { row: AttendanceRecapRow }) {
  const inactive = row.employee.endDate !== null;
  return (
    <div className="flex min-w-0 items-center gap-3">
      <EmployeeAvatar fullName={row.employee.fullName} inactive={inactive} />
      <div className="flex min-w-0 flex-col">
        <span className="truncate text-[14.5px] font-bold">{row.employee.fullName}</span>
        <span className="truncate text-caption text-text-tertiary">
          {row.employee.positionName}
          {inactive ? " · Nonaktif" : ""}
        </span>
      </div>
    </div>
  );
}

// Rekap absensi per karyawan (feature 16) — pola EmployeeTable: tabel glass-data di desktop, card di mobile.
// Tanpa referensi desain (izin user).
export function AttendanceRecapTable({ rows, detailHref, footer }: Props) {
  return (
    <>
      <section className="hidden overflow-hidden rounded-card glass-data lg:block">
        <table className="w-full">
          <thead className="bg-table-head">
            <tr className="h-11 border-b border-border-subtle">
              <th scope="col" className={HEAD}>
                Karyawan
              </th>
              <th scope="col" className={HEAD}>
                Hadir
              </th>
              <th scope="col" className={HEAD}>
                Telat
              </th>
              <th scope="col" className={HEAD}>
                Alpa
              </th>
              <th scope="col" className={HEAD}>
                Izin
              </th>
              <th scope="col" className={HEAD}>
                Sakit
              </th>
              <th scope="col" className={HEAD}>
                Cuti
              </th>
              <th scope="col" className={HEAD}>
                Tanpa pulang
              </th>
              {detailHref ? (
                <th scope="col" className={HEAD}>
                  <span className="sr-only">Rincian</span>
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const { summary } = row;
              return (
                <tr key={row.employee.id} className="h-16 border-t border-border-subtle/90 text-text-primary first:border-t-0">
                  <td className={`${CELL} max-w-64`}>
                    <EmployeeCell row={row} />
                  </td>
                  <td className={CELL}>
                    <div className="flex flex-col items-center">
                      <span className="font-display text-[17px] font-bold tabular-nums">
                        {summary.present}
                        <span className="text-small font-normal text-text-tertiary">/{summary.workingDays}</span>
                      </span>
                      {summary.offDayPresent > 0 ? <span className="text-caption text-text-tertiary">+{summary.offDayPresent} hari libur</span> : null}
                    </div>
                  </td>
                  <td className={CELL}>
                    <div className="flex flex-col items-center">
                      <Count value={summary.late} tone="warning" />
                      {summary.late > 0 ? <span className="text-caption whitespace-nowrap text-text-tertiary">{formatDuration(summary.lateMinutes)}</span> : null}
                    </div>
                  </td>
                  <td className={CELL}>
                    <Count value={summary.absent} tone="danger" />
                  </td>
                  <td className={CELL}>
                    <Count value={summary.permit} />
                  </td>
                  <td className={CELL}>
                    <Count value={summary.sick} />
                  </td>
                  <td className={CELL}>
                    <Count value={summary.leave} />
                  </td>
                  <td className={CELL}>
                    <Count value={summary.missingCheckOut} tone="warning" />
                  </td>
                  {detailHref ? (
                    <td className={`${CELL} text-right`}>
                      <Link
                        href={detailHref(row.employee.id)}
                        className="inline-flex items-center gap-1 text-sm font-bold whitespace-nowrap text-accent-strong hover:text-accent-hover hover:underline focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-accent/45"
                      >
                        Rincian
                        <ChevronRight aria-hidden className="size-4" />
                      </Link>
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
        {footer ? <div className="border-t border-border-subtle px-5 py-3">{footer}</div> : null}
      </section>

      <div className="flex flex-col gap-3 lg:hidden">
        <ul className="flex flex-col gap-3">
          {rows.map((row) => {
            const { summary } = row;
            const stats: { label: string; value: ReactNode }[] = [
              { label: "Hadir", value: `${summary.present}/${summary.workingDays}` },
              { label: "Telat", value: <Count value={summary.late} tone="warning" /> },
              { label: "Alpa", value: <Count value={summary.absent} tone="danger" /> },
              { label: "Izin·Sakit·Cuti", value: <Count value={summary.permit + summary.sick + summary.leave} /> },
            ];
            const notes = [
              summary.late > 0 ? `Telat total ${formatDuration(summary.lateMinutes)}` : null,
              summary.missingCheckOut > 0 ? `${summary.missingCheckOut} hari tanpa absen pulang` : null,
              summary.offDayPresent > 0 ? `${summary.offDayPresent} hari masuk di hari libur` : null,
            ].filter((note): note is string => note !== null);
            return (
              <li key={row.employee.id} className="glass-data flex flex-col gap-3 rounded-[20px] px-4 py-3.5 text-text-primary">
                <div className="flex items-center justify-between gap-3">
                  <EmployeeCell row={row} />
                  {detailHref ? (
                    <Link
                      href={detailHref(row.employee.id)}
                      aria-label={`Rincian absensi ${row.employee.fullName}`}
                      className="flex size-11 shrink-0 items-center justify-center rounded-field text-accent-strong hover:bg-fill-subtle focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-accent/45"
                    >
                      <ChevronRight aria-hidden className="size-5" />
                    </Link>
                  ) : null}
                </div>
                <dl className="grid grid-cols-4 gap-2 border-t border-border-subtle pt-3">
                  {stats.map((stat) => (
                    <div key={stat.label} className="flex flex-col gap-0.5">
                      <dt className="text-caption text-text-tertiary">{stat.label}</dt>
                      <dd className="font-display text-[17px] font-bold tabular-nums">{stat.value}</dd>
                    </div>
                  ))}
                </dl>
                {notes.length > 0 ? <p className="text-small text-text-secondary">{notes.join(" · ")}</p> : null}
              </li>
            );
          })}
        </ul>
        {footer ? <div className="px-1.5">{footer}</div> : null}
      </div>
    </>
  );
}

import type { EmployeeImportRow } from "@exapay/shared";

import { Badge } from "@/components/common/Badge";
import { formatIsoDate } from "@/lib/datetime";
import { EMPLOYMENT_STATUS_LABELS, EMPLOYMENT_STATUS_TONES } from "@/lib/employeeLabels";

type Props = {
  rows: EmployeeImportRow[];
};

const HEAD = "px-4 whitespace-nowrap text-left text-caption font-bold text-text-secondary first:pl-5 last:pr-5";
const CELL = "px-4 py-3 align-top first:pl-5 last:pr-5";
const EMPTY = <span className="text-text-tertiary">—</span>;

function Issues({ row }: { row: EmployeeImportRow }) {
  if (row.issues.length === 0) return <Badge tone="success">Siap diimpor</Badge>;
  return (
    <ul className="flex flex-col gap-1">
      {row.issues.map((issue) => (
        <li key={issue.column} className="text-small text-pretty">
          <span className="font-bold text-danger-text">{issue.column}</span>
          <span className="text-text-secondary"> — {issue.message}</span>
        </li>
      ))}
    </ul>
  );
}

function Name({ row }: { row: EmployeeImportRow }) {
  return (
    <div className="flex min-w-0 flex-col">
      <span className={`text-[14.5px] font-bold ${row.fullName ? "text-text-primary" : "text-text-tertiary"}`}>{row.fullName ?? "(tanpa nama)"}</span>
      {row.employeeNumber ? <span className="text-caption text-text-tertiary tabular-nums">{row.employeeNumber}</span> : null}
    </div>
  );
}

function Job({ row }: { row: EmployeeImportRow }) {
  if (!row.positionName && !row.departmentName) return EMPTY;
  return (
    <>
      {row.positionName ?? "—"}
      <span className="text-text-secondary"> · {row.departmentName ?? "—"}</span>
    </>
  );
}

// Pratinjau impor (diturunkan dari EmployeeTable): nomor baris Excel agar mudah dicari di file,
// kolom "Hasil pemeriksaan" berisi badge Siap atau daftar kesalahan per kolom.
export function ImportPreviewTable({ rows }: Props) {
  return (
    <>
      <section className="hidden overflow-hidden rounded-card glass-data lg:block">
        <table className="w-full table-fixed">
          <thead className="bg-table-head">
            <tr className="h-11 border-b border-border-subtle">
              <th scope="col" className={`${HEAD} w-20`}>
                Baris
              </th>
              <th scope="col" className={`${HEAD} w-[20%]`}>
                Nama
              </th>
              <th scope="col" className={`${HEAD} w-[18%]`}>
                Jabatan · Departemen
              </th>
              <th scope="col" className={`${HEAD} w-30`}>
                Status kerja
              </th>
              <th scope="col" className={`${HEAD} w-30`}>
                Tanggal masuk
              </th>
              <th scope="col" className={HEAD}>
                Hasil pemeriksaan
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.rowNumber} className="border-t border-border-subtle/90 text-text-primary first:border-t-0">
                <td className={`${CELL} text-sm text-text-secondary tabular-nums`}>{row.rowNumber}</td>
                <td className={CELL}>
                  <Name row={row} />
                </td>
                <td className={`${CELL} text-sm leading-snug`}>
                  <Job row={row} />
                </td>
                <td className={CELL}>
                  {row.employmentStatus ? <Badge tone={EMPLOYMENT_STATUS_TONES[row.employmentStatus]}>{EMPLOYMENT_STATUS_LABELS[row.employmentStatus]}</Badge> : EMPTY}
                </td>
                <td className={`${CELL} text-sm text-text-secondary tabular-nums`}>{row.joinDate ? formatIsoDate(row.joinDate) : EMPTY}</td>
                <td className={CELL}>
                  <Issues row={row} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <ul className="flex flex-col gap-3 lg:hidden">
        {rows.map((row) => (
          <li key={row.rowNumber} className="glass-data flex flex-col gap-2.5 rounded-[20px] px-4 py-3.5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="text-caption text-text-tertiary tabular-nums">Baris {row.rowNumber}</span>
                <Name row={row} />
                <span className="text-[13px] text-text-primary">
                  <Job row={row} />
                </span>
              </div>
              {row.employmentStatus ? <Badge tone={EMPLOYMENT_STATUS_TONES[row.employmentStatus]}>{EMPLOYMENT_STATUS_LABELS[row.employmentStatus]}</Badge> : null}
            </div>
            <div className="border-t border-border-subtle pt-2.5">
              <Issues row={row} />
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

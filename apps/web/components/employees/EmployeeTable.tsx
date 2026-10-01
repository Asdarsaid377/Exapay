import type { EmployeeList, EmployeeListItem } from "@exapay/shared";
import { ChevronRight, TriangleAlert } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/common/Badge";
import { EmployeeAvatar } from "@/components/employees/EmployeeAvatar";
import { formatIsoDate } from "@/lib/datetime";
import { EMPLOYMENT_STATUS_LABELS, EMPLOYMENT_STATUS_TONES, type EmployeeNote, employeeNote, minimumWageNote } from "@/lib/employeeLabels";

type Props = {
  employees: EmployeeListItem[];
  // Tanggal hari ini (YYYY-MM-DD) untuk menandai kontrak/percobaan yang segera berakhir
  today: string;
  // Tampilan atasan (bawahan langsung): kolom ringkas tanpa atasan & keterangan
  compact?: boolean;
  // Peringatan upah minimum (feature 34) — owner/admin; null untuk atasan
  minimumWage?: EmployeeList["minimumWage"];
  footer?: React.ReactNode;
};

const HEAD = "px-4 whitespace-nowrap text-left text-caption font-bold text-text-secondary first:pl-5 last:pr-5";
const CELL = "px-4 py-2.5 align-middle first:pl-5 last:pr-5";

function StatusBadge({ employee }: { employee: EmployeeListItem }) {
  if (employee.endDate) return <Badge tone="outline">Nonaktif</Badge>;
  return <Badge tone={EMPLOYMENT_STATUS_TONES[employee.employmentStatus]}>{EMPLOYMENT_STATUS_LABELS[employee.employmentStatus]}</Badge>;
}

// Keterangan baris: peringatan upah minimum lebih dulu, lalu kontrak/percobaan/keluar
function notesOf(employee: EmployeeListItem, today: string, minimumWage: EmployeeList["minimumWage"] | undefined): NonNullable<EmployeeNote>[] {
  const notes = [
    minimumWage ? minimumWageNote(minimumWage.flags[employee.id], minimumWage.current, minimumWage.upcoming) : null,
    employeeNote(employee, today),
  ];
  return notes.filter((note): note is NonNullable<EmployeeNote> => note !== null);
}

function Notes({ notes, inactive }: { notes: NonNullable<EmployeeNote>[]; inactive: boolean }) {
  if (notes.length === 0) return <span className="text-small text-text-secondary">—</span>;
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      {notes.map((note) => (
        <Note key={note.text} note={note} inactive={inactive} />
      ))}
    </div>
  );
}

function Note({ note, inactive }: { note: NonNullable<EmployeeNote>; inactive: boolean }) {
  return (
    <span className={`flex min-w-0 items-center gap-1.75 text-small whitespace-nowrap ${note.warn ? "font-bold text-warning-text" : inactive ? "text-text-tertiary" : "text-text-secondary"}`}>
      {note.warn ? <TriangleAlert aria-hidden className="size-3.75 shrink-0 text-warning-icon" /> : null}
      {note.text}
    </span>
  );
}

// Daftar karyawan (design employees "data-table"): desktop tabel di permukaan paling solid, mobile daftar card.
// Seluruh baris adalah tautan ke detail. Karyawan nonaktif: teks redup, avatar netral, badge outline.
export function EmployeeTable({ employees, today, compact = false, minimumWage, footer }: Props) {
  return (
    <>
      <section className="hidden overflow-hidden rounded-card glass-data lg:block">
        <table className="w-full table-fixed">
          <thead className="bg-table-head">
            <tr className="h-11 border-b border-border-subtle">
              <th scope="col" className={`${HEAD} ${compact ? "w-[34%]" : "w-[21%]"}`}>
                Nama
              </th>
              <th scope="col" className={`${HEAD} ${compact ? "" : "w-[18%]"}`}>
                {compact ? "Jabatan" : "Jabatan · Departemen"}
              </th>
              <th scope="col" className={`${HEAD} w-30`}>
                Status kerja
              </th>
              {compact ? null : (
                <th scope="col" className={`${HEAD} w-[13%]`}>
                  Atasan langsung
                </th>
              )}
              <th scope="col" className={`${HEAD} w-30`}>
                Tanggal masuk
              </th>
              {compact ? null : (
                <th scope="col" className={HEAD}>
                  Keterangan
                </th>
              )}
              <th scope="col" className={`${HEAD} w-11`}>
                <span className="sr-only">Buka</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {employees.map((employee) => {
              const inactive = !!employee.endDate;
              const secondary = inactive ? "text-text-tertiary" : "text-text-secondary";
              return (
                <tr
                  key={employee.id}
                  className={`relative h-16 border-t border-border-subtle/90 transition-colors first:border-t-0 hover:bg-row-hover ${inactive ? "text-text-tertiary" : "text-text-primary"}`}
                >
                  <td className={CELL}>
                    <div className="flex min-w-0 items-center gap-3">
                      <EmployeeAvatar fullName={employee.fullName} inactive={inactive} />
                      <div className="flex min-w-0 flex-col">
                        {/* Tautan menutupi seluruh baris (after:absolute) — satu tab stop per baris */}
                        <Link
                          href={`/employees/${employee.id}`}
                          className="truncate text-[14.5px] font-bold after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:ring-3 focus-visible:after:ring-accent/45 focus-visible:after:ring-inset"
                        >
                          {employee.fullName}
                        </Link>
                        {employee.employeeNumber ? <span className="text-caption text-text-tertiary tabular-nums">{employee.employeeNumber}</span> : null}
                      </div>
                    </div>
                  </td>
                  <td className={`${CELL} text-sm leading-snug`}>
                    {employee.position.name}
                    {compact ? null : <span className={secondary}> · {employee.department.name}</span>}
                  </td>
                  <td className={CELL}>
                    <StatusBadge employee={employee} />
                  </td>
                  {compact ? null : <td className={`${CELL} truncate text-sm ${secondary}`}>{employee.supervisor?.fullName ?? "—"}</td>}
                  <td className={`${CELL} text-sm tabular-nums ${secondary}`}>{formatIsoDate(employee.joinDate)}</td>
                  {compact ? null : (
                    <td className={CELL}>
                      <Notes notes={notesOf(employee, today, minimumWage)} inactive={inactive} />
                    </td>
                  )}
                  <td className={CELL}>
                    <ChevronRight aria-hidden className="size-4 text-text-muted" />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {footer ? <div className="border-t border-border-subtle px-5 py-3">{footer}</div> : null}
      </section>

      <div className="flex flex-col gap-3 lg:hidden">
        <ul className="flex flex-col gap-3">
          {employees.map((employee) => {
            const inactive = !!employee.endDate;
            const notes = compact ? [] : notesOf(employee, today, minimumWage);
            return (
              <li key={employee.id}>
                <Link
                  href={`/employees/${employee.id}`}
                  className={`glass-data flex flex-col gap-2.5 rounded-[20px] px-4 py-3.5 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-accent/45 ${
                    inactive ? "text-text-tertiary" : "text-text-primary"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <EmployeeAvatar fullName={employee.fullName} size="md" inactive={inactive} />
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-[15px] font-bold">{employee.fullName}</span>
                      <span className={`truncate text-[13px] ${inactive ? "text-text-tertiary" : "text-text-secondary"}`}>
                        {employee.position.name} · {employee.department.name}
                      </span>
                    </div>
                    <StatusBadge employee={employee} />
                  </div>
                  {notes.length > 0 ? (
                    <div className="border-t border-border-subtle pt-2.5">
                      <Notes notes={notes} inactive={inactive} />
                    </div>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
        {footer}
      </div>
    </>
  );
}

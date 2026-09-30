"use client";

import { EMPLOYEE_ACTIVITY_FILTERS, type EmployeeActivityFilter, EMPLOYMENT_STATUSES, type EmployeeListQuery, type EmploymentStatus } from "@exapay/shared";
import { Search, SlidersHorizontal } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { Button } from "@/components/common/Button";
import { Dialog } from "@/components/common/Dialog";
import { SegmentedControl } from "@/components/common/SegmentedControl";
import { SelectField } from "@/components/common/SelectField";
import { ACTIVITY_FILTER_LABELS, EMPLOYMENT_STATUS_LABELS, employeesHref } from "@/lib/employeeLabels";

type Props = {
  query: EmployeeListQuery;
  departments: { id: string; name: string }[];
};

type Filters = Omit<EmployeeListQuery, "page">;

const ACTIVITY_OPTIONS = EMPLOYEE_ACTIVITY_FILTERS.map((value) => ({ value, label: ACTIVITY_FILTER_LABELS[value] }));


const SEARCH_CLASSES =
  "h-11 w-full rounded-field border border-border-control bg-control pr-3.5 pl-10.5 text-body text-text-primary placeholder:text-text-muted transition-[border-color,box-shadow,background-color] focus:border-accent focus:bg-surface-solid focus:ring-3 focus:ring-accent/28 focus:outline-none";

// Filter daftar karyawan (design employees "filter-bar"): cari, departemen, status kerja, Aktif/Nonaktif/Semua.
// Semua filter tersimpan di URL (bisa dibagikan & tombol kembali berfungsi); pencarian diterapkan setelah berhenti mengetik.
// Mobile: cari + segmented + tombol Filter yang membuka sheet berisi select.
export function EmployeeFilters({ query, departments }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [, startTransition] = useTransition();
  const [q, setQ] = useState(query.q);
  const [sheetOpen, setSheetOpen] = useState(false);
  const current: Filters = { q: query.q, departmentId: query.departmentId, status: query.status, activity: query.activity };
  const currentRef = useRef(current);
  currentRef.current = current;

  function apply(next: Partial<Filters>) {
    startTransition(() => router.replace(employeesHref({ ...currentRef.current, ...next }), { scroll: false }));
  }

  // Sinkron jika URL berubah dari luar (mis. tautan "Reset filter")
  useEffect(() => setQ(query.q), [query.q]);

  useEffect(() => {
    if (q.trim() === query.q) return;
    const timer = setTimeout(() => apply({ q: q.trim() }), 300);
    return () => clearTimeout(timer);
    // apply membaca filter terbaru lewat ref
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, query.q, pathname]);

  const activeSheetFilters = (query.departmentId ? 1 : 0) + (query.status ? 1 : 0);

  const departmentSelect = (id: string, labelHidden: boolean) => (
    <SelectField
      id={id}
      labelHidden={labelHidden}
      label="Departemen"
      value={query.departmentId ?? ""}
      onChange={(e) => apply({ departmentId: e.target.value || null })}
      className="lg:w-49"
    >
      <option value="">Semua departemen</option>
      {departments.map((department) => (
        <option key={department.id} value={department.id}>
          {department.name}
        </option>
      ))}
    </SelectField>
  );

  const statusSelect = (id: string, labelHidden: boolean) => (
    <SelectField
      id={id}
      labelHidden={labelHidden}
      label="Status kerja"
      value={query.status ?? ""}
      onChange={(e) => apply({ status: (e.target.value || null) as EmploymentStatus | null })}
      className="lg:w-44"
    >
      <option value="">Semua status</option>
      {EMPLOYMENT_STATUSES.map((status) => (
        <option key={status} value={status}>
          {EMPLOYMENT_STATUS_LABELS[status]}
        </option>
      ))}
    </SelectField>
  );

  const search = (
    <div role="search" className="relative w-full lg:max-w-85">
      <label htmlFor="employee-search" className="sr-only">
        Cari karyawan
      </label>
      <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3.5 size-4.5 -translate-y-1/2 text-text-tertiary" />
      <input
        id="employee-search"
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Cari nama atau nomor induk"
        className={SEARCH_CLASSES}
      />
    </div>
  );

  const activity = (fullWidth: boolean) => (
    <SegmentedControl<EmployeeActivityFilter>
      label="Tampilkan karyawan"
      options={ACTIVITY_OPTIONS}
      value={query.activity}
      onChange={(value) => apply({ activity: value })}
      fullWidth={fullWidth}
    />
  );

  return (
    <>
      {/* Desktop: satu panel kaca */}
      <div className="glass hidden items-center gap-2.5 rounded-card p-2.5 lg:flex">
        {search}
        {departmentSelect("employee-filter-department", true)}
        {statusSelect("employee-filter-status", true)}
        <div className="flex-1" />
        {activity(false)}
      </div>

      {/* Mobile */}
      <div className="flex flex-col gap-3 lg:hidden">
        {search}
        <div className="flex gap-2">
          <div className="min-w-0 flex-1">{activity(true)}</div>
          <Button variant="secondary" size="md" className="h-11 shrink-0 px-3.5" onClick={() => setSheetOpen(true)}>
            <SlidersHorizontal aria-hidden className="size-4.25" />
            Filter{activeSheetFilters ? ` (${activeSheetFilters})` : ""}
          </Button>
        </div>
      </div>
      <Dialog
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title="Filter karyawan"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                apply({ departmentId: null, status: null });
                setSheetOpen(false);
              }}
            >
              Reset
            </Button>
            <Button onClick={() => setSheetOpen(false)}>Selesai</Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {departmentSelect("employee-sheet-department", false)}
          {statusSelect("employee-sheet-status", false)}
        </div>
      </Dialog>
    </>
  );
}

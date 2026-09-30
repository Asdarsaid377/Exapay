import { TENANT_STATUS_FILTERS, type TenantStatusFilter } from "@exapay/shared";
import { Search } from "lucide-react";
import Link from "next/link";

import { TENANT_FILTER_LABELS } from "@/lib/tenantStatus";

type Props = {
  q: string;
  status: TenantStatusFilter;
  counts: Record<TenantStatusFilter, number>;
  // URL daftar dengan filter tertentu (halaman kembali ke 1)
  hrefFor: (filter: { q: string; status: TenantStatusFilter }) => string;
};

// Pencarian (form GET — tanpa JS) + tab status berisi jumlah
export function TenantFilters({ q, status, counts, hrefFor }: Props) {
  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <nav aria-label="Filter status" className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 lg:pb-0">
        {TENANT_STATUS_FILTERS.map((filter) => {
          const current = filter === status;
          return (
            <Link
              key={filter}
              href={hrefFor({ q, status: filter })}
              aria-current={current ? "page" : undefined}
              className={`inline-flex h-10 shrink-0 items-center gap-2 rounded-full px-4 text-sm transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-accent/45 ${
                current ? "bg-accent-soft font-bold text-accent-strong" : "font-medium text-text-secondary hover:bg-glass-hover"
              }`}
            >
              {TENANT_FILTER_LABELS[filter]}
              <span className="tabular-nums">{counts[filter]}</span>
            </Link>
          );
        })}
      </nav>
      <form role="search" method="get" className="relative w-full lg:w-80">
        {status !== "all" ? <input type="hidden" name="status" value={status} /> : null}
        <label htmlFor="tenant-search" className="sr-only">
          Cari tenant
        </label>
        <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3.5 size-4.5 -translate-y-1/2 text-text-tertiary" />
        <input
          id="tenant-search"
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Cari nama usaha atau email pemilik"
          className="h-11 w-full rounded-field border border-border-control bg-control pr-3.5 pl-10.5 text-body text-text-primary placeholder:text-text-muted transition-[border-color,box-shadow,background-color] focus:border-accent focus:bg-surface-solid focus:ring-3 focus:ring-accent/28 focus:outline-none"
        />
      </form>
    </div>
  );
}

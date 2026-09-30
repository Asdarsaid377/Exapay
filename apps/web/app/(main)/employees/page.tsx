import { employeeListQuerySchema } from "@exapay/shared";
import { CloudOff, Plus, SearchX, Upload, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Button, buttonClassName } from "@/components/common/Button";
import { EmptyState } from "@/components/common/EmptyState";
import { Pagination } from "@/components/common/Pagination";
import { EmployeeFilters } from "@/components/employees/EmployeeFilters";
import { EmployeeTable } from "@/components/employees/EmployeeTable";
import { PageHeader } from "@/components/layout/PageHeader";
import { fetchEmployees } from "@/lib/api/employees";
import { fetchOrganization } from "@/lib/api/organization";
import { todayIso } from "@/lib/datetime";
import { employeesHref } from "@/lib/employeeLabels";

export const metadata: Metadata = { title: "Karyawan — Exapay" };

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const first = (value: string | string[] | undefined) => (typeof value === "string" ? value : undefined);

// Daftar karyawan (feature 11). Owner/admin: semua karyawan + tambah/impor. Atasan: bawahan langsung, hanya baca.
export default async function EmployeesPage({ searchParams }: Props) {
  const raw = await searchParams;
  const query = employeeListQuerySchema.parse({
    q: first(raw.q),
    departmentId: first(raw.departmentId) ?? null,
    status: first(raw.status) ?? null,
    activity: first(raw.activity),
    page: first(raw.page),
  });
  const [result, organization] = await Promise.all([fetchEmployees(query), fetchOrganization()]);

  if (!result.ok) {
    return (
      <>
        <PageHeader title="Karyawan" />
        <EmptyState icon={CloudOff} title="Daftar karyawan tidak dapat dimuat" description={result.error} />
      </>
    );
  }
  const list = result.data;
  const manage = list.scope === "all";
  const total = list.counts.active + list.counts.inactive;
  const filtered = query.q !== "" || query.departmentId !== null || query.status !== null;
  const departments = organization.ok ? organization.data.departments : [];

  const actions = manage ? (
    <>
      {/* TODO(feature 12): tautkan ke /employees/import */}
      <Button variant="secondary" disabled aria-label="Impor Excel (segera hadir)" title="Segera hadir" className="max-sm:size-11 max-sm:px-0">
        <Upload aria-hidden className="size-4.25" />
        <span className="max-sm:hidden">Impor Excel</span>
      </Button>
      <Link href="/employees/new" className={buttonClassName({ className: "max-sm:h-11" })}>
        <Plus aria-hidden className="size-4.25" />
        <span className="sm:hidden">Tambah</span>
        <span className="max-sm:hidden">Tambah karyawan</span>
      </Link>
    </>
  ) : null;

  const header = (
    <PageHeader
      title={manage ? "Karyawan" : "Bawahan saya"}
      description={
        total === 0
          ? manage
            ? "0 karyawan"
            : "Belum ada karyawan yang atasan langsungnya Anda."
          : manage
            ? `${list.counts.active} aktif · ${list.counts.inactive} nonaktif`
            : `${list.counts.active} bawahan langsung · hanya baca`
      }
      actions={actions}
    />
  );

  if (total === 0) {
    return (
      <>
        {header}
        {manage ? (
          <EmptyState
            icon={Users}
            title="Belum ada karyawan"
            description="Tambahkan karyawan satu per satu. Impor sekaligus dari file Excel segera hadir."
            action={
              <Link href="/employees/new" className={buttonClassName()}>
                Tambah karyawan
              </Link>
            }
          />
        ) : (
          <EmptyState
            icon={Users}
            title="Belum ada bawahan"
            description="Karyawan yang atasan langsungnya Anda akan muncul di sini. Minta pemilik atau admin mengatur atasan langsung di data karyawan."
          />
        )}
      </>
    );
  }

  const from = (list.page - 1) * list.pageSize + 1;
  const to = Math.min(list.page * list.pageSize, list.total);
  const footer =
    list.total > list.pageSize ? (
      <Pagination page={list.page} pageSize={list.pageSize} total={list.total} hrefFor={(page) => employeesHref({ ...query, page })} />
    ) : (
      <p className="text-small text-text-secondary tabular-nums">
        Menampilkan {list.total === 0 ? 0 : `${from}–${to} dari ${list.total}`} karyawan
      </p>
    );

  return (
    <>
      {header}
      <EmployeeFilters query={query} departments={departments} />
      {list.items.length === 0 ? (
        <EmptyState
          icon={SearchX}
          title="Tidak ada karyawan yang cocok"
          description={
            filtered
              ? query.q
                ? `Tidak ada hasil untuk “${query.q}” dengan filter ini.`
                : "Coba ubah filter."
              : query.activity === "inactive"
                ? "Belum ada karyawan nonaktif."
                : "Tidak ada data di halaman ini."
          }
          action={
            filtered ? (
              <Link href={employeesHref({ q: "", departmentId: null, status: null, activity: query.activity })} className="text-sm font-bold text-accent-strong hover:text-accent-hover">
                Reset filter
              </Link>
            ) : null
          }
        />
      ) : (
        <EmployeeTable employees={list.items} today={todayIso()} compact={!manage} footer={footer} />
      )}
    </>
  );
}

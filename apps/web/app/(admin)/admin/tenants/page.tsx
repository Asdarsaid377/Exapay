import { adminTenantListQuerySchema, type TenantStatusFilter } from "@exapay/shared";
import { Building2, CloudOff, SearchX } from "lucide-react";
import type { Metadata } from "next";

import { CreateTenantDialog } from "@/components/admin/CreateTenantDialog";
import { TenantFilters } from "@/components/admin/TenantFilters";
import { TenantTable } from "@/components/admin/TenantTable";
import { EmptyState } from "@/components/common/EmptyState";
import { Pagination } from "@/components/common/Pagination";
import { StatTile } from "@/components/common/StatTile";
import { PageHeader } from "@/components/layout/PageHeader";
import { fetchAdminTenants } from "@/lib/api/adminTenants";

export const metadata: Metadata = { title: "Tenant — Panel Super-admin Exapay" };

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function listHref({ q, status, page = 1 }: { q: string; status: TenantStatusFilter; page?: number }): string {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (status !== "all") params.set("status", status);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `/admin/tenants?${query}` : "/admin/tenants";
}

export default async function AdminTenantsPage({ searchParams }: Props) {
  const raw = await searchParams;
  const parsed = adminTenantListQuerySchema.safeParse({
    q: typeof raw.q === "string" ? raw.q : undefined,
    status: typeof raw.status === "string" ? raw.status : undefined,
    page: typeof raw.page === "string" ? raw.page : undefined,
  });
  const query = parsed.success ? parsed.data : { q: "", status: "all" as const, page: 1 };
  const result = await fetchAdminTenants(query);
  const filtered = query.q !== "" || query.status !== "all";
  const header = (
    <PageHeader
      title="Tenant"
      description="Usaha yang terdaftar di Exapay. Data karyawan dan gaji tenant tidak ditampilkan di panel ini."
      actions={<CreateTenantDialog />}
    />
  );

  if (!result.ok) {
    return (
      <>
        {header}
        <EmptyState icon={CloudOff} title="Daftar tenant tidak dapat dimuat" description={result.error} />
      </>
    );
  }
  const list = result.data;

  return (
    <>
      {header}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        <StatTile label="Total tenant" value={String(list.counts.all)} note="Semua usaha terdaftar" />
        <StatTile label="Aktif" value={String(list.counts.active)} note="Pengguna bisa masuk" />
        <StatTile label="Menunggu pemilik" value={String(list.counts.pending_owner)} note="Undangan belum diterima" />
        <StatTile label="Nonaktif" value={String(list.counts.deactivated)} note="Login ditolak" />
      </div>

      {list.counts.all === 0 ? (
        <EmptyState
          icon={Building2}
          title="Belum ada tenant"
          description="Tenant muncul di sini saat pemilik usaha mendaftar sendiri atau saat Anda membuatnya dan mengundang pemiliknya."
          action={<CreateTenantDialog />}
        />
      ) : (
        <div className="flex flex-col gap-4">
          <TenantFilters q={query.q} status={query.status} counts={list.counts} hrefFor={listHref} />
          {list.items.length === 0 ? (
            <EmptyState
              icon={SearchX}
              title="Tidak ada tenant yang cocok"
              description={filtered ? "Coba kata kunci lain atau pilih filter status yang berbeda." : "Tidak ada data di halaman ini."}
            />
          ) : (
            <TenantTable tenants={list.items} />
          )}
          <Pagination
            page={list.page}
            pageSize={list.pageSize}
            total={list.total}
            hrefFor={(page) => listHref({ q: query.q, status: query.status, page })}
          />
        </div>
      )}
    </>
  );
}

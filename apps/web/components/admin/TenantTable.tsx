import type { AdminTenantListItem } from "@exapay/shared";
import { ChevronRight } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/common/Badge";
import { formatShortDate } from "@/lib/datetime";
import { OWNER_STATE_LABELS, TENANT_STATUS_LABELS, TENANT_STATUS_TONES } from "@/lib/tenantStatus";

type Props = {
  tenants: AdminTenantListItem[];
};

// Status pemilik hanya ditampilkan jika perlu perhatian (belum bisa masuk)
function ownerLine(tenant: AdminTenantListItem): { name: string; email: string; note: string | null } {
  if (!tenant.owner) return { name: "Belum ada pemilik", email: "—", note: null };
  const { fullName, email, state } = tenant.owner;
  return { name: fullName, email, note: state === "active" ? null : OWNER_STATE_LABELS[state] };
}

const HEAD = "px-4 pb-3 text-left text-caption font-bold text-text-tertiary first:pl-6 last:pr-6";
const CELL = "px-4 py-3.5 align-middle first:pl-6 last:pr-6";

// Daftar tenant di card kaca kuat. Desktop: tabel; mobile: baris bertumpuk. Setiap baris membuka detail.
export function TenantTable({ tenants }: Props) {
  return (
    <section className="glass-strong overflow-hidden rounded-card">
      <table className="hidden w-full lg:table">
        <thead>
          <tr>
            <th scope="col" className={`${HEAD} pt-5`}>
              Usaha
            </th>
            <th scope="col" className={`${HEAD} pt-5`}>
              Pemilik
            </th>
            <th scope="col" className={`${HEAD} pt-5 text-right`}>
              Pengguna
            </th>
            <th scope="col" className={`${HEAD} pt-5`}>
              Status
            </th>
            <th scope="col" className={`${HEAD} pt-5`}>
              <span className="sr-only">Buka</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {tenants.map((tenant) => {
            const owner = ownerLine(tenant);
            return (
              <tr key={tenant.id} className="relative border-t border-border-subtle transition-colors hover:bg-glass-hover">
                <td className={CELL}>
                  {/* Tautan menutupi seluruh baris (after:absolute) — satu tab stop per baris */}
                  <Link
                    href={`/admin/tenants/${tenant.id}`}
                    className="font-bold text-text-primary after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:rounded-inner focus-visible:after:ring-3 focus-visible:after:ring-accent/45 focus-visible:after:ring-inset"
                  >
                    {tenant.name}
                  </Link>
                  <p className="text-caption text-text-tertiary">Terdaftar {formatShortDate(tenant.createdAt)}</p>
                </td>
                <td className={CELL}>
                  <p className="text-sm text-text-primary">{owner.name}</p>
                  <p className="text-small text-text-secondary">
                    {owner.email}
                    {owner.note ? ` · ${owner.note}` : ""}
                  </p>
                </td>
                <td className={`${CELL} text-right text-sm text-text-primary tabular-nums`}>{tenant.memberCount}</td>
                <td className={CELL}>
                  <Badge tone={TENANT_STATUS_TONES[tenant.status]}>{TENANT_STATUS_LABELS[tenant.status]}</Badge>
                </td>
                <td className={`${CELL} w-10`}>
                  <ChevronRight aria-hidden className="size-4.5 text-text-tertiary" />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <ul className="lg:hidden">
        {tenants.map((tenant) => {
          const owner = ownerLine(tenant);
          return (
            <li key={tenant.id} className="border-t border-border-subtle first:border-t-0">
              <Link
                href={`/admin/tenants/${tenant.id}`}
                className="flex items-center gap-3 px-5 py-4 transition-colors hover:bg-glass-hover focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-accent/45 focus-visible:ring-inset"
              >
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex items-start justify-between gap-3">
                    <p className="min-w-0 text-[15px] font-bold text-text-primary">{tenant.name}</p>
                    <Badge tone={TENANT_STATUS_TONES[tenant.status]}>{TENANT_STATUS_LABELS[tenant.status]}</Badge>
                  </div>
                  <p className="truncate text-small text-text-secondary">
                    {owner.name} · {owner.email}
                  </p>
                  <p className="text-caption text-text-tertiary">
                    {owner.note ? `${owner.note} · ` : ""}
                    {tenant.memberCount} pengguna · terdaftar {formatShortDate(tenant.createdAt)}
                  </p>
                </div>
                <ChevronRight aria-hidden className="size-4.5 shrink-0 text-text-tertiary" />
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

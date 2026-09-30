"use client";

import type { TenantMembership } from "@exapay/shared";
import { ChevronRight, LoaderCircle } from "lucide-react";

import { ROLE_LABELS } from "@/lib/roleLabels";

type Props = {
  tenants: TenantMembership[];
  // tenantId yang sedang diproses (menampilkan spinner & mengunci pilihan lain)
  pendingTenantId: string | null;
  onSelect: (tenantId: string) => void;
};

// Daftar usaha di langkah "Pilih usaha" /login — pola item sama dengan dropdown tenant switcher (tanpa ikon hias per baris)
export function TenantPicker({ tenants, pendingTenantId, onSelect }: Props) {
  return (
    <ul className="flex flex-col gap-2">
      {tenants.map((tenant) => {
        const pending = pendingTenantId === tenant.tenantId;
        return (
          <li key={tenant.tenantId}>
            <button
              type="button"
              onClick={() => onSelect(tenant.tenantId)}
              disabled={pendingTenantId !== null}
              className="flex min-h-15 w-full items-center gap-3 rounded-field border border-border-control bg-control px-4 py-2.5 text-left transition-colors hover:border-accent hover:bg-accent/10 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-accent/45 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate text-[15px] font-bold text-text-primary">{tenant.tenantName}</span>
                <span className="text-[13px] text-text-secondary">{ROLE_LABELS[tenant.role]}</span>
              </span>
              {pending ? (
                <LoaderCircle aria-label="Memproses" className="size-4.5 animate-spin text-accent-strong" />
              ) : (
                <ChevronRight aria-hidden className="size-4.5 text-text-secondary" />
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

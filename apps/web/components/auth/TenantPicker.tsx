"use client";

import type { TenantMembership } from "@exapay/shared";
import { Building2, ChevronRight, LoaderCircle } from "lucide-react";

import { ROLE_LABELS } from "@/lib/roleLabels";

type Props = {
  tenants: TenantMembership[];
  // tenantId yang sedang diproses (menampilkan spinner & mengunci pilihan lain)
  pendingTenantId: string | null;
  onSelect: (tenantId: string) => void;
};

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
              className="flex w-full items-center gap-3 rounded-field border border-border bg-surface px-4 py-3 text-left transition-colors hover:border-accent hover:bg-accent-soft focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
                <Building2 aria-hidden className="size-4" />
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-semibold text-text-primary">{tenant.tenantName}</span>
                <span className="text-xs text-text-muted">{ROLE_LABELS[tenant.role]}</span>
              </span>
              {pending ? (
                <LoaderCircle aria-label="Memproses" className="size-4 animate-spin text-accent" />
              ) : (
                <ChevronRight aria-hidden className="size-4 text-text-muted" />
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

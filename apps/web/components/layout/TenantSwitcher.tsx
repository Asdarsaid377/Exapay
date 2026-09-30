"use client";

import type { TenantMembership } from "@exapay/shared";
import { Check, ChevronDown, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { selectTenant } from "@/actions/auth";
import { DropdownMenu } from "@/components/common/DropdownMenu";
import { ROLE_LABELS } from "@/lib/roleLabels";

type Props = {
  activeTenant: TenantMembership;
  tenants: TenantMembership[];
};

function TenantLabel({ tenant }: { tenant: TenantMembership }) {
  return (
    <span className="flex min-w-0 flex-col text-left">
      <span className="truncate text-sm font-semibold text-text-primary">{tenant.tenantName}</span>
      <span className="text-xs text-text-muted">{ROLE_LABELS[tenant.role]}</span>
    </span>
  );
}

// Usaha aktif di header. Jika user tergabung di lebih dari satu usaha, menjadi dropdown untuk berpindah.
export function TenantSwitcher({ activeTenant, tenants }: Props) {
  const router = useRouter();
  const [pendingTenantId, setPendingTenantId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (tenants.length <= 1) {
    return (
      <div className="min-w-0 px-3 py-2">
        <TenantLabel tenant={activeTenant} />
      </div>
    );
  }

  async function handleSelect(tenantId: string, close: () => void) {
    if (tenantId === activeTenant.tenantId) {
      close();
      return;
    }
    setError(null);
    setPendingTenantId(tenantId);
    try {
      const outcome = await selectTenant(tenantId);
      if (outcome.kind === "error") {
        setError(outcome.message);
        return;
      }
      close();
      // Peran bisa berbeda di usaha lain → halaman awal bisa berubah (mis. karyawan → /me)
      router.replace(outcome.redirectTo);
      router.refresh();
    } catch {
      setError("Tidak dapat terhubung ke server. Periksa koneksi Anda lalu coba lagi.");
    } finally {
      setPendingTenantId(null);
    }
  }

  return (
    <DropdownMenu
      label="Ganti usaha"
      triggerClassName="flex max-w-64 items-center gap-2 rounded-field px-3 py-2 transition-colors hover:bg-surface-secondary"
      trigger={
        <>
          <TenantLabel tenant={activeTenant} />
          <ChevronDown aria-hidden className="size-4 shrink-0 text-text-muted" />
        </>
      }
    >
      {(close) => (
        <div className="flex flex-col gap-1">
          <p className="px-3 pt-1 pb-2 text-xs text-text-muted">Pindah ke usaha lain</p>
          {error ? <p className="px-3 pb-2 text-xs text-danger">{error}</p> : null}
          <ul className="flex flex-col gap-0.5">
            {tenants.map((tenant) => {
              const active = tenant.tenantId === activeTenant.tenantId;
              return (
                <li key={tenant.tenantId}>
                  <button
                    type="button"
                    disabled={pendingTenantId !== null}
                    aria-current={active ? "true" : undefined}
                    onClick={() => void handleSelect(tenant.tenantId, close)}
                    className="flex w-full items-center gap-3 rounded-field px-3 py-2.5 transition-colors hover:bg-surface-secondary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <span className="min-w-0 flex-1">
                      <TenantLabel tenant={tenant} />
                    </span>
                    {pendingTenantId === tenant.tenantId ? (
                      <LoaderCircle aria-label="Memproses" className="size-4 animate-spin text-accent" />
                    ) : active ? (
                      <Check aria-label="Usaha aktif" className="size-4 text-accent-strong" />
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </DropdownMenu>
  );
}

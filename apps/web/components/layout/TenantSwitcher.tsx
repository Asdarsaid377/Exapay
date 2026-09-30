"use client";

import type { TenantMembership } from "@exapay/shared";
import { Check, ChevronsUpDown, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { selectTenant } from "@/actions/auth";
import { DropdownMenu } from "@/components/common/DropdownMenu";
import { ROLE_LABELS } from "@/lib/roleLabels";

type Props = {
  activeTenant: TenantMembership;
  tenants: TenantMembership[];
  // Teks di bawah nama usaha (default: label peran). Portal: "Nama · Peran"
  subtitle?: string;
};

function renderLabel(name: string, subtitle: string) {
  return (
    <span className="flex min-w-0 flex-col text-left">
      <span className="truncate font-display text-[14.5px] font-bold text-text-primary lg:text-[15px]">{name}</span>
      <span className="truncate text-caption text-text-secondary lg:text-[13px]">{subtitle}</span>
    </span>
  );
}

// Usaha aktif di header. Jika user tergabung di lebih dari satu usaha, menjadi dropdown untuk berpindah.
export function TenantSwitcher({ activeTenant, tenants, subtitle }: Props) {
  const router = useRouter();
  const [pendingTenantId, setPendingTenantId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const activeSubtitle = subtitle ?? ROLE_LABELS[activeTenant.role];

  if (tenants.length <= 1) {
    return <div className="min-w-0 px-2 py-1 lg:px-3.5">{renderLabel(activeTenant.tenantName, activeSubtitle)}</div>;
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
      triggerClassName="flex h-11 max-w-72 items-center gap-2 rounded-field px-2 transition-colors hover:bg-glass-hover lg:h-12.5 lg:gap-3.5 lg:px-3.5"
      trigger={
        <>
          {renderLabel(activeTenant.tenantName, activeSubtitle)}
          <ChevronsUpDown aria-hidden className="size-4 shrink-0 text-text-secondary lg:size-4.5" />
        </>
      }
    >
      {(close) => (
        <>
          <p className="px-3 pt-2 pb-1.5 text-xs font-medium text-text-tertiary">Pindah usaha</p>
          {error ? <p className="px-3 pb-2 text-caption text-danger-text">{error}</p> : null}
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
                    className={`flex min-h-13 w-full items-center gap-3 rounded-inner px-3 py-2 text-left transition-colors hover:bg-accent/10 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-accent/45 disabled:cursor-not-allowed disabled:opacity-60 ${
                      active ? "bg-accent/10" : ""
                    }`}
                  >
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="truncate text-sm font-bold text-text-primary">{tenant.tenantName}</span>
                      <span className="text-[13px] text-text-secondary">{ROLE_LABELS[tenant.role]}</span>
                    </span>
                    {pendingTenantId === tenant.tenantId ? (
                      <LoaderCircle aria-label="Memproses" className="size-4.5 animate-spin text-accent-strong" />
                    ) : active ? (
                      <Check aria-label="Usaha aktif" className="size-4.5 text-accent-strong" />
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </DropdownMenu>
  );
}

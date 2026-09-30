"use client";

import type { SessionUser, TenantMembership } from "@exapay/shared";
import { Menu, X } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";

import { ExapayLogo } from "@/components/auth/ExapayLogo";
import { SidebarNav } from "@/components/layout/SidebarNav";
import { TenantSwitcher } from "@/components/layout/TenantSwitcher";
import { UserMenu } from "@/components/layout/UserMenu";
import type { NavSection } from "@/lib/navigation";

type Props = {
  user: SessionUser;
  activeTenant: TenantMembership;
  tenants: TenantMembership[];
  // Menu yang sudah disaring per peran (server)
  sections: NavSection[];
  children: ReactNode;
};

// Kerangka area owner/admin/atasan: sidebar tetap di desktop (≥lg), drawer di mobile.
export function AppShell({ user, activeTenant, tenants, sections, children }: Props) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Drawer terbuka: kunci scroll halaman + Escape menutup
  useEffect(() => {
    if (!drawerOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") setDrawerOpen(false);
    }
    document.addEventListener("keydown", handleKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKey);
    };
  }, [drawerOpen]);

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[16.5rem_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-border bg-surface lg:flex">
        <div className="flex h-16 shrink-0 items-center px-6">
          <ExapayLogo />
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-4">
          <SidebarNav sections={sections} />
        </div>
      </aside>

      {drawerOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button type="button" aria-label="Tutup menu" onClick={() => setDrawerOpen(false)} className="absolute inset-0 bg-inverse/40" />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Menu utama"
            className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col border-r border-border bg-surface shadow-card"
          >
            <div className="flex h-16 shrink-0 items-center justify-between px-5">
              <ExapayLogo />
              <button
                type="button"
                aria-label="Tutup menu"
                onClick={() => setDrawerOpen(false)}
                className="flex size-9 items-center justify-center rounded-full text-text-secondary transition-colors hover:bg-surface-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                <X aria-hidden className="size-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-3 py-4">
              <SidebarNav sections={sections} onNavigate={() => setDrawerOpen(false)} />
            </div>
          </div>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-2 border-b border-border bg-background px-4 sm:px-6 lg:px-8">
          <button
            type="button"
            aria-label="Buka menu"
            aria-expanded={drawerOpen}
            onClick={() => setDrawerOpen(true)}
            className="-ml-1 flex size-9 shrink-0 items-center justify-center rounded-full text-text-secondary transition-colors hover:bg-surface-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent lg:hidden"
          >
            <Menu aria-hidden className="size-5" />
          </button>
          <TenantSwitcher activeTenant={activeTenant} tenants={tenants} />
          <div className="ml-auto shrink-0">
            <UserMenu user={user} />
          </div>
        </header>
        <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}

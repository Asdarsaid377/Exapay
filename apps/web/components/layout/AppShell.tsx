"use client";

import type { SessionUser } from "@exapay/shared";
import { Menu, X } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";

import { ExapayLogo } from "@/components/auth/ExapayLogo";
import { BackdropShapes } from "@/components/layout/BackdropShapes";
import { SidebarNav } from "@/components/layout/SidebarNav";
import { UserAvatar } from "@/components/layout/UserAvatar";
import { UserMenu } from "@/components/layout/UserMenu";
import type { NavSection } from "@/lib/navigation";

type Props = {
  user: SessionUser;
  // Sisi kiri header: TenantSwitcher (area usaha) atau judul panel (super-admin)
  headerStart: ReactNode;
  // Menu yang sudah disaring per peran (server)
  sections: NavSection[];
  // "Senin, 30 September 2026" — dihitung di server agar tidak berbeda saat hydration
  todayLabel: string;
  // Tautan ke portal /me di menu akun (area usaha — absen milik sendiri, feature 14); tidak ada di panel super-admin
  showPortalLink?: boolean;
  // Item "Panduan setup 4/7" di menu akun (feature 48) — null bila tidak relevan
  setupGuideProgress?: string | null;
  children: ReactNode;
};

const ICON_BUTTON =
  "grid size-11 shrink-0 place-items-center rounded-field text-text-primary transition-colors hover:bg-glass-hover focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-accent/45";

// Kerangka area owner/admin/atasan dan panel super-admin (snapshot context/designs/dashboard.html):
// sidebar & header = panel kaca mengambang di atas bentuk latar; drawer kaca di mobile.
export function AppShell({ user, headerStart, sections, todayLabel, showPortalLink = false, setupGuideProgress = null, children }: Props) {
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
    <>
      <BackdropShapes variant="app" />
      <div className="min-h-dvh px-3.5 pt-3 pb-8 lg:grid lg:grid-cols-[248px_minmax(0,1fr)] lg:gap-5 lg:p-5">
        <aside className="glass sticky top-5 hidden h-[calc(100dvh-2.5rem)] flex-col gap-6 rounded-card px-3.5 py-5 lg:flex">
          <div className="px-2.5 py-1">
            <ExapayLogo />
          </div>
          <div className="-mx-1 flex-1 overflow-y-auto px-1">
            <SidebarNav sections={sections} />
          </div>
        </aside>

        {drawerOpen ? (
          <div className="fixed inset-0 z-40 lg:hidden">
            <button type="button" aria-label="Tutup menu" onClick={() => setDrawerOpen(false)} className="absolute inset-0 bg-inverse/32" />
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Menu utama"
              className="glass-overlay absolute top-2.5 bottom-2.5 left-2.5 flex w-75 max-w-[calc(100vw-1.25rem)] flex-col gap-4 rounded-[26px] px-3 py-4"
            >
              <div className="flex items-center justify-between pl-2.5">
                <ExapayLogo />
                <button type="button" aria-label="Tutup menu" onClick={() => setDrawerOpen(false)} className={ICON_BUTTON}>
                  <X aria-hidden className="size-5" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto">
                <SidebarNav sections={sections} onNavigate={() => setDrawerOpen(false)} touch />
              </div>
              <div className="flex items-center gap-3 border-t border-border-subtle p-3">
                <UserAvatar fullName={user.fullName} />
                <div className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-bold text-text-primary">{user.fullName}</span>
                  <span className="truncate text-caption text-text-secondary">{user.email}</span>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        <div className="flex min-w-0 flex-col gap-5">
          <header className="glass sticky top-3 z-20 flex h-15 items-center gap-1.5 rounded-[20px] pr-2 pl-1.5 lg:top-5 lg:h-17 lg:gap-4 lg:rounded-card lg:pr-3 lg:pl-2.5">
            <button
              type="button"
              aria-label="Buka menu"
              aria-expanded={drawerOpen}
              onClick={() => setDrawerOpen(true)}
              className={`${ICON_BUTTON} lg:hidden`}
            >
              <Menu aria-hidden className="size-5.5" />
            </button>
            <div className="min-w-0 flex-1">{headerStart}</div>
            <span className="hidden text-sm text-text-secondary lg:block">{todayLabel}</span>
            <UserMenu user={user} switchTo={showPortalLink ? "portal" : undefined} setupGuideProgress={setupGuideProgress} />
          </header>
          <main className="flex flex-col gap-4 lg:gap-5">{children}</main>
        </div>
      </div>
    </>
  );
}

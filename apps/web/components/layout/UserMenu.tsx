"use client";

import type { SessionUser } from "@exapay/shared";
import { ChevronDown, Clock, LayoutDashboard, LoaderCircle, LogOut } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { logout } from "@/actions/auth";
import { DropdownMenu } from "@/components/common/DropdownMenu";
import { UserAvatar } from "@/components/layout/UserAvatar";

type Props = {
  user: SessionUser;
  // Chevron di samping avatar (desktop); portal cukup avatar
  showChevron?: boolean;
  // Pindah area untuk owner/admin/atasan yang juga absen (feature 14): sidebar → portal /me, portal → /dashboard
  switchTo?: "portal" | "dashboard";
};

const SWITCH_LINKS = {
  portal: { href: "/me", label: "Absen saya", icon: Clock },
  dashboard: { href: "/dashboard", label: "Kembali ke dashboard", icon: LayoutDashboard },
} as const;

// Avatar inisial di header: identitas akun + keluar
export function UserMenu({ user, showChevron = true, switchTo }: Props) {
  const [loggingOut, setLoggingOut] = useState(false);
  const switchLink = switchTo ? SWITCH_LINKS[switchTo] : null;

  return (
    <DropdownMenu
      label="Menu akun"
      align="end"
      panelClassName="w-65"
      triggerClassName="flex items-center gap-2 rounded-full p-0.75 transition-colors hover:bg-glass-hover lg:h-12.5 lg:pr-2 lg:pl-1.25"
      trigger={
        <>
          <UserAvatar fullName={user.fullName} />
          {showChevron ? <ChevronDown aria-hidden className="hidden size-4 text-text-secondary lg:block" /> : null}
        </>
      }
    >
      {(close) => (
        <>
          <div className="flex flex-col gap-0.5 px-3 py-2.5">
            <p className="truncate font-display text-[15px] font-bold text-text-primary">{user.fullName}</p>
            <p className="truncate text-[13px] text-text-secondary">{user.email}</p>
          </div>
          <div className="mx-2 my-0.5 border-t border-border-subtle" />
          {switchLink ? (
            <Link
              href={switchLink.href}
              onClick={close}
              className="flex h-11 w-full items-center gap-2.5 rounded-inner px-3 text-sm font-bold text-text-primary transition-colors hover:bg-accent/10 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-accent/45"
            >
              <switchLink.icon aria-hidden className="size-4.5 text-text-secondary" />
              {switchLink.label}
            </Link>
          ) : null}
          <form action={logout} onSubmit={() => setLoggingOut(true)}>
            <button
              type="submit"
              disabled={loggingOut}
              className="flex h-11 w-full items-center gap-2.5 rounded-inner px-3 text-sm font-bold text-danger-text transition-colors hover:bg-danger/8 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-accent/45 disabled:opacity-60"
            >
              {loggingOut ? <LoaderCircle aria-hidden className="size-4.5 animate-spin" /> : <LogOut aria-hidden className="size-4.5" />}
              {loggingOut ? "Keluar…" : "Keluar"}
            </button>
          </form>
        </>
      )}
    </DropdownMenu>
  );
}

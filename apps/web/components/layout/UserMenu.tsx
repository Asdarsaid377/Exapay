"use client";

import type { SessionUser } from "@exapay/shared";
import { LoaderCircle, LogOut } from "lucide-react";
import { useState } from "react";

import { logout } from "@/actions/auth";
import { DropdownMenu } from "@/components/common/DropdownMenu";

type Props = {
  user: SessionUser;
};

function initialsOf(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  const letters = parts.length > 1 ? `${parts[0]?.[0] ?? ""}${parts[parts.length - 1]?.[0] ?? ""}` : (parts[0]?.slice(0, 2) ?? "");
  return letters.toUpperCase() || "?";
}

// Avatar inisial di header: identitas akun + keluar
export function UserMenu({ user }: Props) {
  const [loggingOut, setLoggingOut] = useState(false);

  return (
    <DropdownMenu
      label="Menu akun"
      align="end"
      triggerClassName="flex size-9 items-center justify-center rounded-full bg-accent-soft text-sm font-semibold text-accent-strong transition-colors hover:bg-border"
      trigger={initialsOf(user.fullName)}
    >
      {() => (
        <div className="flex flex-col gap-1">
          <div className="flex flex-col px-3 pt-1 pb-2">
            <p className="truncate text-sm font-semibold text-text-primary">{user.fullName}</p>
            <p className="truncate text-xs text-text-muted">{user.email}</p>
          </div>
          <div className="border-t border-border" />
          <form action={logout} onSubmit={() => setLoggingOut(true)}>
            <button
              type="submit"
              disabled={loggingOut}
              className="flex w-full items-center gap-3 rounded-field px-3 py-2.5 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-secondary hover:text-text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent disabled:opacity-60"
            >
              {loggingOut ? <LoaderCircle aria-hidden className="size-4 animate-spin" /> : <LogOut aria-hidden className="size-4" />}
              {loggingOut ? "Keluar…" : "Keluar"}
            </button>
          </form>
        </div>
      )}
    </DropdownMenu>
  );
}

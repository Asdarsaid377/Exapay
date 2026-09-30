"use client";

import { CalendarDays, House, ListChecks, ReceiptText, UserRound } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { matchesPath, PORTAL_MENU, type PortalIconKey } from "@/lib/navigation";

const ICONS: Record<PortalIconKey, typeof House> = {
  home: House,
  tasks: ListChecks,
  attendance: CalendarDays,
  payslips: ReceiptText,
  profile: UserRound,
};

// Bottom navigation portal karyawan (mobile-first). Beranda hanya aktif tepat di /me.
export function PortalBottomNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Menu portal" className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)]">
      <ul className="mx-auto grid max-w-lg grid-cols-5">
        {PORTAL_MENU.map((item) => {
          const Icon = ICONS[item.icon];
          const current = item.href === "/me" ? pathname === "/me" : matchesPath(pathname, item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={current ? "page" : undefined}
                className={`flex flex-col items-center gap-1 px-1 py-2.5 text-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent ${
                  current ? "font-semibold text-accent-strong" : "font-medium text-text-muted hover:text-text-primary"
                }`}
              >
                <Icon aria-hidden className="size-5" />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

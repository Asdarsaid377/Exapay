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

// Bottom navigation portal karyawan — panel kaca mengambang. Beranda hanya aktif tepat di /me.
export function PortalBottomNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Menu portal" className="fixed inset-x-0 bottom-0 z-20 px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
      <ul className="glass mx-auto grid h-18 max-w-[calc(32rem-1.5rem)] grid-cols-5 gap-1 rounded-[24px] p-1.5">
        {PORTAL_MENU.map((item) => {
          const Icon = ICONS[item.icon];
          const current = item.href === "/me" ? pathname === "/me" : matchesPath(pathname, item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={current ? "page" : undefined}
                className={`flex h-full flex-col items-center justify-center gap-1 rounded-[18px] text-xs transition-[background-color,transform] active:scale-95 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-accent/45 ${
                  current ? "bg-accent-soft font-bold text-accent-strong" : "font-medium text-text-secondary hover:bg-glass-hover"
                }`}
              >
                <Icon aria-hidden className="size-5.5" />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

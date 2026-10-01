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

type Props = {
  // Karyawan nonaktif: hanya menu Slip & Profil (feature 37)
  inactive: boolean;
};

// Bottom navigation portal karyawan — panel kaca mengambang. Beranda hanya aktif tepat di /me.
export function PortalBottomNav({ inactive }: Props) {
  const pathname = usePathname();
  const items = inactive ? PORTAL_MENU.filter((item) => item.whenInactive) : PORTAL_MENU;

  return (
    <nav aria-label="Menu portal" className="fixed inset-x-0 bottom-0 z-20 px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
      <ul className={`glass mx-auto grid h-18 max-w-[calc(32rem-1.5rem)] gap-1 rounded-[24px] p-1.5 ${inactive ? "grid-cols-2" : "grid-cols-5"}`}>
        {items.map((item) => {
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

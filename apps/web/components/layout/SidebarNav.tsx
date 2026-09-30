"use client";

import {
  CalendarCheck,
  LayoutDashboard,
  Network,
  Settings,
  ShieldCheck,
  Target,
  Users,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { findStaffLink, matchesPath, type NavIconKey, type NavSection } from "@/lib/navigation";

type Props = {
  sections: NavSection[];
  // Dipanggil saat tautan diklik (drawer mobile menutup diri)
  onNavigate?: () => void;
};

const ICONS: Record<NavIconKey, typeof LayoutDashboard> = {
  dashboard: LayoutDashboard,
  employees: Users,
  organization: Network,
  attendance: CalendarCheck,
  kpi: Target,
  payroll: Wallet,
  compliance: ShieldCheck,
  settings: Settings,
};

function sectionMatches(section: NavSection, pathname: string): boolean {
  return section.children ? section.children.some((child) => matchesPath(pathname, child.href)) : matchesPath(pathname, section.href);
}

// Menu sidebar (desktop & drawer). Sub-menu grup hanya terbuka untuk grup yang sedang aktif.
export function SidebarNav({ sections, onNavigate }: Props) {
  const pathname = usePathname();
  const activeHref = findStaffLink(pathname)?.href ?? null;

  return (
    <nav aria-label="Menu utama">
      <ul className="flex flex-col gap-1">
        {sections.map((section) => {
          const Icon = ICONS[section.icon];
          const inSection = sectionMatches(section, pathname);
          const current = !section.children && inSection;
          const itemClasses = current
            ? "bg-accent-soft font-semibold text-accent-strong"
            : inSection
              ? "font-semibold text-text-primary"
              : "font-medium text-text-secondary hover:bg-surface-secondary hover:text-text-primary";

          return (
            <li key={section.label}>
              <Link
                href={section.href}
                onClick={onNavigate}
                aria-current={current ? "page" : undefined}
                className={`flex items-center gap-3 rounded-field px-3 py-2.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent ${itemClasses}`}
              >
                <Icon aria-hidden className="size-5 shrink-0" />
                {section.label}
              </Link>
              {section.children && inSection ? (
                <ul className="mt-1 mb-1 ml-5 flex flex-col gap-0.5 border-l border-border pl-3">
                  {section.children.map((child) => {
                    const childCurrent = child.href === activeHref;
                    return (
                      <li key={child.href}>
                        <Link
                          href={child.href}
                          onClick={onNavigate}
                          aria-current={childCurrent ? "page" : undefined}
                          className={`block rounded-field px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent ${
                            childCurrent
                              ? "bg-accent-soft font-semibold text-accent-strong"
                              : "font-medium text-text-secondary hover:bg-surface-secondary hover:text-text-primary"
                          }`}
                        >
                          {child.label}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

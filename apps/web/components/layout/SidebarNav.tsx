"use client";

import {
  Building2,
  CalendarCheck,
  ChevronDown,
  LayoutDashboard,
  Network,
  ReceiptText,
  Settings,
  ShieldCheck,
  Target,
  Users,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { findStaffLink, matchesPath, type NavIconKey, type NavSection } from "@/lib/navigation";

type Props = {
  sections: NavSection[];
  // Dipanggil saat tautan diklik (drawer mobile menutup diri)
  onNavigate?: () => void;
  // Item lebih tinggi di drawer mobile (46px / sub 44px)
  touch?: boolean;
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
  tenants: Building2,
  billing: ReceiptText,
};

const FOCUS = "focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-accent/45";

function sectionMatches(section: NavSection, pathname: string): boolean {
  return section.children ? section.children.some((child) => matchesPath(pathname, child.href)) : matchesPath(pathname, section.href);
}

// Menu sidebar (desktop & drawer). Grup dibuka/ditutup dengan klik; grup berisi halaman aktif terbuka otomatis.
export function SidebarNav({ sections, onNavigate, touch = false }: Props) {
  const pathname = usePathname();
  const activeHref = findStaffLink(pathname)?.href ?? null;
  // Pilihan buka/tutup manual per grup; tanpa pilihan → terbuka jika berisi halaman aktif
  const [toggled, setToggled] = useState<Record<string, boolean>>({});

  const itemBase = `flex w-full items-center gap-3 rounded-field px-3 text-left transition-colors ${touch ? "h-11.5 text-[15px]" : "h-11 text-[14.5px]"} ${FOCUS}`;

  return (
    <nav aria-label="Menu utama">
      <ul className="flex flex-col gap-0.5">
        {sections.map((section) => {
          const Icon = ICONS[section.icon];
          const inSection = sectionMatches(section, pathname);

          if (!section.children) {
            return (
              <li key={section.label}>
                <Link
                  href={section.href}
                  onClick={onNavigate}
                  aria-current={inSection ? "page" : undefined}
                  className={`${itemBase} ${inSection ? "bg-accent-soft font-bold text-accent-strong" : "font-medium text-text-primary hover:bg-glass-hover"}`}
                >
                  <Icon aria-hidden className="size-4.75 shrink-0" />
                  <span className="flex-1">{section.label}</span>
                </Link>
              </li>
            );
          }

          const open = toggled[section.label] ?? inSection;
          const panelId = `nav-group-${section.icon}`;
          return (
            <li key={section.label} className="flex flex-col gap-0.5">
              <button
                type="button"
                aria-expanded={open}
                aria-controls={panelId}
                onClick={() => setToggled((current) => ({ ...current, [section.label]: !open }))}
                className={`${itemBase} font-medium hover:bg-glass-hover ${inSection ? "text-accent-strong" : "text-text-primary"}`}
              >
                <Icon aria-hidden className="size-4.75 shrink-0" />
                <span className="flex-1">{section.label}</span>
                <ChevronDown aria-hidden className={`size-4 shrink-0 text-text-secondary transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
              </button>
              {open ? (
                <ul id={panelId} className="flex flex-col gap-0.5 pb-1.5">
                  {section.children.map((child) => {
                    const current = child.href === activeHref;
                    return (
                      <li key={child.href}>
                        <Link
                          href={child.href}
                          onClick={onNavigate}
                          aria-current={current ? "page" : undefined}
                          className={`flex w-full items-center rounded-inner pr-3 pl-10.75 font-medium transition-colors ${touch ? "h-11 text-[14.5px]" : "h-9.5 text-sm"} ${FOCUS} ${
                            current ? "bg-accent/12 text-accent-strong" : "text-text-secondary hover:bg-glass-hover"
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

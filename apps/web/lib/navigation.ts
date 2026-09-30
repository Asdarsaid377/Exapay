import type { MembershipRole } from "@exapay/shared";

// Satu sumber menu untuk sidebar, bottom nav portal, halaman "Segera hadir", dan guard route di proxy.
// Hanya routing/tampilan — API tetap memeriksa peran di setiap endpoint.
// File ini tidak boleh mengimpor component/ikon (ikut dimuat proxy.ts).

// Peran yang memakai area sidebar (karyawan memakai portal /me)
export type StaffRole = Exclude<MembershipRole, "karyawan">;

export type NavIconKey = "dashboard" | "employees" | "organization" | "attendance" | "kpi" | "payroll" | "compliance" | "settings" | "tenants";

export type NavLink = {
  label: string;
  href: string;
  roles: readonly StaffRole[];
};

// Section tanpa children = satu tautan. Section dengan children = grup; tautannya adalah child pertama yang terlihat.
export type NavSection = {
  label: string;
  icon: NavIconKey;
  href: string;
  roles: readonly StaffRole[];
  children?: readonly NavLink[];
};

const ALL: readonly StaffRole[] = ["owner", "admin", "atasan"];
const MANAGE: readonly StaffRole[] = ["owner", "admin"];

// Sesuai project-overview.md "Navigasi": atasan tidak melihat Payroll & Pengaturan.
export const STAFF_MENU: readonly NavSection[] = [
  { label: "Dashboard", icon: "dashboard", href: "/dashboard", roles: ALL },
  { label: "Karyawan", icon: "employees", href: "/employees", roles: ALL },
  { label: "Organisasi", icon: "organization", href: "/organization", roles: ALL },
  {
    label: "Absensi",
    icon: "attendance",
    href: "/attendance",
    roles: ALL,
    children: [
      { label: "Rekap", href: "/attendance", roles: ALL },
      { label: "Pengajuan izin", href: "/attendance/requests", roles: ALL },
      { label: "Koreksi", href: "/attendance/corrections", roles: MANAGE },
    ],
  },
  {
    label: "KPI",
    icon: "kpi",
    href: "/kpi",
    roles: ALL,
    children: [
      { label: "Verifikasi tugas", href: "/kpi/verification", roles: ALL },
      { label: "Skor", href: "/kpi/scores", roles: ALL },
      { label: "Penilaian", href: "/kpi/reviews", roles: ALL },
      { label: "Template KPI", href: "/kpi/templates", roles: MANAGE },
    ],
  },
  {
    label: "Payroll",
    icon: "payroll",
    href: "/payroll",
    roles: MANAGE,
    children: [
      { label: "Periode gaji", href: "/payroll", roles: MANAGE },
      { label: "Laporan", href: "/payroll/reports", roles: MANAGE },
    ],
  },
  { label: "Kepatuhan", icon: "compliance", href: "/compliance", roles: ALL },
  {
    label: "Pengaturan",
    icon: "settings",
    href: "/settings",
    roles: MANAGE,
    children: [
      { label: "Profil usaha", href: "/settings/company", roles: MANAGE },
      { label: "Pengguna", href: "/settings/users", roles: MANAGE },
      { label: "Komponen gaji", href: "/settings/salary-components", roles: MANAGE },
      { label: "Absensi", href: "/settings/attendance", roles: MANAGE },
      { label: "Siklus KPI", href: "/settings/kpi", roles: MANAGE },
    ],
  },
];

// Area super-admin /admin (navigasi terpisah, project-overview "Navigasi"). `roles` tidak dipakai —
// akses /admin ditentukan flag super-admin (proxy + API), bukan peran tenant.
export const ADMIN_MENU: readonly NavSection[] = [{ label: "Tenant", icon: "tenants", href: "/admin/tenants", roles: [] }];

export type PortalIconKey = "home" | "tasks" | "attendance" | "payslips" | "profile";

export type PortalLink = { label: string; href: string; icon: PortalIconKey };

// Bottom nav portal karyawan (project-overview.md): Beranda, Tugas, Absensi, Slip, Profil
export const PORTAL_MENU: readonly PortalLink[] = [
  { label: "Beranda", href: "/me", icon: "home" },
  { label: "Tugas", href: "/me/tasks", icon: "tasks" },
  { label: "Absensi", href: "/me/attendance", icon: "attendance" },
  { label: "Slip", href: "/me/payslips", icon: "payslips" },
  { label: "Profil", href: "/me/profile", icon: "profile" },
];

// Halaman portal yang tidak ada di bottom nav (dibuka dari halaman lain)
export const PORTAL_EXTRA_LINKS: readonly { label: string; href: string }[] = [{ label: "Kinerja saya", href: "/me/performance" }];

export function matchesPath(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

// Semua tautan sidebar yang benar-benar dibuka (section tanpa children + semua children)
function staffLinks(): NavLink[] {
  return STAFF_MENU.flatMap((section) => (section.children ? [...section.children] : [{ label: section.label, href: section.href, roles: section.roles }]));
}

// Tautan paling spesifik yang cocok dengan path (mis. /attendance/corrections, bukan /attendance)
export function findStaffLink(pathname: string): NavLink | null {
  let best: NavLink | null = null;
  for (const link of staffLinks()) {
    if (matchesPath(pathname, link.href) && (!best || link.href.length > best.href.length)) best = link;
  }
  return best;
}

// Menu yang terlihat untuk peran ini; href grup = child pertama yang terlihat
export function staffMenuFor(role: StaffRole): NavSection[] {
  return STAFF_MENU.flatMap((section) => {
    if (!section.roles.includes(role)) return [];
    if (!section.children) return [section];
    const children = section.children.filter((child) => child.roles.includes(role));
    const first = children[0];
    return first ? [{ ...section, href: first.href, children }] : [];
  });
}

// false jika path termasuk menu yang tidak boleh dibuka peran ini. Path di luar menu → true (halaman aslinya yang memutuskan / 404).
export function canAccessStaffPath(pathname: string, role: StaffRole): boolean {
  const link = findStaffLink(pathname);
  return !link || link.roles.includes(role);
}

export function findPortalLink(pathname: string): { label: string; href: string } | null {
  const links = [...PORTAL_MENU, ...PORTAL_EXTRA_LINKS];
  let best: { label: string; href: string } | null = null;
  for (const link of links) {
    if (matchesPath(pathname, link.href) && (!best || link.href.length > best.href.length)) best = link;
  }
  return best;
}

import { ChevronRight, LayoutDashboard } from "lucide-react";
import Link from "next/link";

// Pintasan ke area sidebar di beranda portal untuk owner/admin/atasan yang juga absen (semua peran mendarat di /me setelah
// login). Dibangun tanpa referensi visual (izin user 2026-10-05) — pola baris TenantPicker di permukaan solid portal.
export function DashboardShortcut() {
  return (
    <Link
      href="/dashboard"
      className="surface-solid flex min-h-15 items-center gap-3 rounded-[20px] px-4 py-2.5 transition-colors hover:bg-accent/10 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-accent/45"
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent/10">
        <LayoutDashboard aria-hidden className="size-5 text-accent-strong" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[15px] font-bold text-text-primary">Buka dashboard</span>
        <span className="text-[13px] text-text-secondary">Kelola karyawan, absensi, dan payroll</span>
      </span>
      <ChevronRight aria-hidden className="size-4.5 text-text-secondary" />
    </Link>
  );
}

import { Construction } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { EmptyState } from "@/components/common/EmptyState";
import { PageHeader } from "@/components/layout/PageHeader";
import { getSession } from "@/lib/auth/getSession";
import { findStaffLink, type NavLink } from "@/lib/navigation";

type Props = {
  params: Promise<{ slug: string[] }>;
};

const secondaryLinkClasses =
  "inline-flex items-center justify-center rounded-full border-2 border-border-strong bg-surface px-6 py-2.5 text-sm font-semibold text-text-primary transition-colors hover:bg-surface-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2";

// Menu sidebar yang halamannya belum dibangun → "Segera hadir". Halaman asli (page.tsx di route-nya) otomatis
// menggantikan ini karena route statis lebih spesifik daripada catch-all. Path di luar menu → 404.
async function menuLinkFor(params: Props["params"]): Promise<NavLink | null> {
  const { slug } = await params;
  const pathname = `/${slug.join("/")}`;
  const link = findStaffLink(pathname);
  return link && link.href === pathname ? link : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const link = await menuLinkFor(params);
  return { title: link ? `${link.label} — Exapay` : "Exapay" };
}

export default async function ComingSoonPage({ params }: Props) {
  const link = await menuLinkFor(params);
  const role = (await getSession())?.activeTenant?.role;
  if (!link || !role || role === "karyawan" || !link.roles.includes(role)) notFound();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={link.label} />
      <EmptyState
        icon={Construction}
        title="Segera hadir"
        description={`Halaman ${link.label} sedang disiapkan dan akan tersedia di pembaruan berikutnya.`}
        action={
          <Link href="/dashboard" className={secondaryLinkClasses}>
            Kembali ke dashboard
          </Link>
        }
      />
    </div>
  );
}

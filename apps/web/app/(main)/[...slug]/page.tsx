import { Construction } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { buttonClassName } from "@/components/common/Button";
import { EmptyState } from "@/components/common/EmptyState";
import { PageHeader } from "@/components/layout/PageHeader";
import { getSession } from "@/lib/auth/getSession";
import { findStaffLink, type NavLink } from "@/lib/navigation";

type Props = {
  params: Promise<{ slug: string[] }>;
};

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
    <>
      <PageHeader title={link.label} />
      <EmptyState
        icon={Construction}
        title="Segera hadir"
        description={`Halaman ${link.label} sedang disiapkan dan akan tersedia di pembaruan berikutnya.`}
        action={
          <Link href="/dashboard" className={buttonClassName({ variant: "secondary" })}>
            Kembali ke dashboard
          </Link>
        }
      />
    </>
  );
}

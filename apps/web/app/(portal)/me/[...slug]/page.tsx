import { Construction } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { buttonClassName } from "@/components/common/Button";
import { EmptyState } from "@/components/common/EmptyState";
import { PageHeader } from "@/components/layout/PageHeader";
import { findPortalLink } from "@/lib/navigation";

type Props = {
  params: Promise<{ slug: string[] }>;
};

// Menu portal yang halamannya belum dibangun → "Segera hadir" (digantikan otomatis oleh page.tsx aslinya). Selain itu 404.
async function portalLinkFor(params: Props["params"]): Promise<{ label: string; href: string } | null> {
  const { slug } = await params;
  const pathname = `/me/${slug.join("/")}`;
  const link = findPortalLink(pathname);
  return link && link.href === pathname ? link : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const link = await portalLinkFor(params);
  return { title: link ? `${link.label} — Exapay` : "Exapay" };
}

export default async function PortalComingSoonPage({ params }: Props) {
  const link = await portalLinkFor(params);
  if (!link) notFound();

  return (
    <>
      <PageHeader title={link.label} />
      <EmptyState
        icon={Construction}
        surface="solid"
        title="Segera hadir"
        description={`Halaman ${link.label} sedang disiapkan dan akan tersedia di pembaruan berikutnya.`}
        action={
          <Link href="/me" className={buttonClassName({ variant: "secondary" })}>
            Kembali ke beranda
          </Link>
        }
      />
    </>
  );
}

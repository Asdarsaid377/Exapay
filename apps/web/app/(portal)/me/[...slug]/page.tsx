import { Construction } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { EmptyState } from "@/components/common/EmptyState";
import { PageHeader } from "@/components/layout/PageHeader";
import { findPortalLink } from "@/lib/navigation";

type Props = {
  params: Promise<{ slug: string[] }>;
};

const secondaryLinkClasses =
  "inline-flex items-center justify-center rounded-full border-2 border-border-strong bg-surface px-6 py-2.5 text-sm font-semibold text-text-primary transition-colors hover:bg-surface-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2";

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
    <div className="flex flex-col gap-6">
      <PageHeader title={link.label} />
      <EmptyState
        icon={Construction}
        title="Segera hadir"
        description={`Halaman ${link.label} sedang disiapkan dan akan tersedia di pembaruan berikutnya.`}
        action={
          <Link href="/me" className={secondaryLinkClasses}>
            Kembali ke beranda
          </Link>
        }
      />
    </div>
  );
}

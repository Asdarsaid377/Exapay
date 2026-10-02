"use client";

import type { SubscriptionSummary } from "@exapay/shared";
import { Clock } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { Banner } from "@/components/common/Banner";
import { buttonClassName } from "@/components/common/Button";
import { BILLING_HREF, daysLeftLabel, formatSubscriptionDate, periodNoun } from "@/lib/billingLabels";

type Props = {
  summary: SubscriptionSummary;
  // Hanya owner yang membuka /settings/billing; admin diarahkan ke pemilik usaha
  canManage: boolean;
};

// Banner pengingat langganan di atas konten area owner/admin (feature 40): trial H-7/H-3/H-1, masa tenggang, baca-saja.
// Tahap dihitung API (subscriptionNoticeAt — sama dengan email worker). Disembunyikan di /settings/billing (status sudah
// tampil di halaman itu).
export function SubscriptionBanner({ summary, canManage }: Props) {
  const pathname = usePathname();
  if (!summary.notice || pathname === BILLING_HREF) return null;

  const action = canManage ? (
    <Link href={BILLING_HREF} className={buttonClassName({ variant: "secondary" })}>
      Lihat langganan
    </Link>
  ) : undefined;
  const contactOwner = canManage ? "" : " Hubungi pemilik usaha untuk mengaktifkan langganan.";
  const graceEnd = formatSubscriptionDate(summary.graceEndsAt);

  if (summary.notice === "read_only") {
    return (
      <Banner
        tone="danger"
        title="Usaha dalam mode baca-saja"
        description={`${periodNoun(summary)} dan masa tenggang telah berakhir. Data masih bisa dilihat dan diekspor, tetapi tidak bisa diubah sampai langganan diaktifkan kembali.${contactOwner}`}
        action={action}
      />
    );
  }

  if (summary.notice === "grace_started") {
    return (
      <Banner
        tone="warning"
        title={`${periodNoun(summary)} telah berakhir — masa tenggang sampai ${graceEnd}`}
        description={`Usaha masih bisa dipakai seperti biasa. Mode baca-saja mulai ${daysLeftLabel(summary.daysLeft ?? 0)} bila langganan belum diaktifkan.${contactOwner}`}
        action={action}
      />
    );
  }

  const daysLeft = summary.daysLeft ?? 0;
  return (
    <Banner
      tone={summary.notice === "trial_h7" ? "neutral" : "warning"}
      icon={summary.notice === "trial_h7" ? Clock : undefined}
      title={`Trial gratis berakhir ${daysLeftLabel(daysLeft)}`}
      description={`Trial berakhir ${formatSubscriptionDate(summary.endsAt)}, dilanjutkan masa tenggang sampai ${graceEnd}. Data tidak pernah dihapus.${contactOwner}`}
      action={action}
    />
  );
}

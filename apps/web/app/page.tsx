import type { Metadata } from "next";
import { connection } from "next/server";

import { LandingBackdrop } from "@/components/landing/LandingBackdrop";
import { LandingClosingCta } from "@/components/landing/LandingClosingCta";
import { LandingFaq } from "@/components/landing/LandingFaq";
import { LandingFeatures } from "@/components/landing/LandingFeatures";
import { LandingFooter } from "@/components/landing/LandingFooter";
import { LandingHeader } from "@/components/landing/LandingHeader";
import { LandingHero } from "@/components/landing/LandingHero";
import { LandingPricing } from "@/components/landing/LandingPricing";
import { LandingProblems } from "@/components/landing/LandingProblems";
import { LandingStartWhereYouAre } from "@/components/landing/LandingStartWhereYouAre";
import { LandingSteps } from "@/components/landing/LandingSteps";
import { fetchPublicPrice } from "@/lib/api/publicPricing";
import { landingFaqs, trialCtaLabel } from "@/lib/landingContent";
import { siteUrl } from "@/lib/siteUrl";

const TITLE = "Exapay — Gaji, absensi & kinerja karyawan untuk UMKM";
const DESCRIPTION =
  "Hitung gaji lengkap dengan BPJS dan PPh 21 TER, absensi dari HP karyawan, dan skor kinerja dari tugas harian. Untuk UMKM yang belum punya HRD. Coba gratis.";

export async function generateMetadata(): Promise<Metadata> {
  await connection();
  const base = siteUrl();
  return {
    metadataBase: base,
    title: { absolute: TITLE },
    description: DESCRIPTION,
    alternates: { canonical: "/" },
    openGraph: {
      type: "website",
      locale: "id_ID",
      url: "/",
      siteName: "Exapay",
      title: TITLE,
      description: DESCRIPTION,
      images: [{ url: "/icons/icon-512.png", width: 512, height: 512, alt: "Logo Exapay" }],
    },
    twitter: { card: "summary", title: TITLE, description: DESCRIPTION },
  };
}

// Landing page publik untuk tamu (feature 43, snapshot context/designs/landing.html). Pengguna login diarahkan proxy ke
// halaman sesuai peran. Dirender per request (domain dari env runtime) — harga dari API di-cache 5 menit
// (lib/api/publicPricing.ts), sisanya konten statis.
export default async function HomePage() {
  await connection();
  const result = await fetchPublicPrice();
  const price = result.ok ? result.data : null;
  const trialDays = price?.trialDays ?? null;
  const ctaLabel = trialCtaLabel(trialDays);

  return (
    <div className="relative isolate overflow-x-clip">
      <LandingBackdrop />
      <div className="mx-auto flex w-full max-w-landing flex-col px-4 pt-3 lg:px-8 lg:pt-4 xl:px-0">
        <LandingHeader ctaLabel={ctaLabel} />
        <main>
          <LandingHero ctaLabel={ctaLabel} />
          <LandingProblems />
          <LandingStartWhereYouAre />
          <LandingFeatures />
          <LandingSteps />
          <LandingPricing price={price} ctaLabel={ctaLabel} />
          <LandingFaq faqs={landingFaqs(trialDays)} />
          <LandingClosingCta trialDays={trialDays} ctaLabel={ctaLabel} />
        </main>
        <LandingFooter />
      </div>
    </div>
  );
}

import { SearchX } from "lucide-react";
import Link from "next/link";

import { buttonClassName } from "@/components/common/Button";
import { EmptyState } from "@/components/common/EmptyState";

type Props = {
  // Halaman awal area tempat 404 tampil (mis. /dashboard, /admin/tenants, /me)
  homeHref: string;
  homeLabel: string;
  // solid: portal karyawan (batas lapisan blur)
  surface?: "glass" | "solid";
};

// Halaman tidak ditemukan (404) di dalam kerangka area (sidebar/bottom nav tetap ada) — pengganti 404 bawaan Next.js
// yang tidak terbaca di tema krem. Turunan EmptyState (izin user 2026-10-02).
export function NotFoundState({ homeHref, homeLabel, surface = "glass" }: Props) {
  return (
    <EmptyState
      icon={SearchX}
      surface={surface}
      title="Halaman tidak ditemukan"
      description="Alamat ini tidak ada atau belum tersedia. Periksa kembali tautannya, atau kembali ke halaman awal."
      action={
        <Link href={homeHref} className={buttonClassName({ variant: "secondary" })}>
          {homeLabel}
        </Link>
      }
    />
  );
}

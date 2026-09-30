"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { createKpiReviews } from "@/actions/kpiReviews";
import { Banner } from "@/components/common/Banner";
import { Button } from "@/components/common/Button";

type Props = {
  startDate: string;
  count: number;
};

// Karyawan yang memenuhi syarat tetapi belum punya penilaian di periode terpilih (mis. baru masuk / baru diberi template)
// → tambahkan dengan membuat ulang periode yang sama (owner/admin, feature 22). Pola Banner detail karyawan.
export function MissingReviewsBanner({ startDate, count }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function add() {
    setError(null);
    setSubmitting(true);
    try {
      const outcome = await createKpiReviews({ startDate });
      if (outcome.kind === "error") setError(outcome.message);
      else router.refresh();
    } catch {
      setError("Tidak dapat terhubung ke server. Periksa koneksi Anda lalu coba lagi.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Banner
      tone={error ? "danger" : "warning"}
      title={error ?? `${count} karyawan belum masuk penilaian periode ini`}
      description={error ? undefined : "Karyawan baru atau yang jabatannya baru diberi template KPI. Tambahkan agar ikut dinilai."}
      action={
        <Button variant="secondary" onClick={add} loading={submitting}>
          {submitting ? "Menambahkan…" : "Tambahkan"}
        </Button>
      }
    />
  );
}

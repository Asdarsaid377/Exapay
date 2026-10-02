import type { Metadata } from "next";

import { AuthHeading } from "@/components/auth/AuthHeading";
import { AuthShell } from "@/components/auth/AuthShell";
import { PaymentConfirmationPanel } from "@/components/billing/PaymentConfirmationPanel";
import { FormAlert } from "@/components/common/FormAlert";
import { lookupPaymentConfirmation } from "@/lib/api/paymentConfirmations";

export const metadata: Metadata = { title: "Konfirmasi pembayaran — Exapay", robots: { index: false, follow: false } };

type Props = {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

// Tautan dari email "Pembayaran dilaporkan" (feature 42) — tanpa login, token = akses. Halaman ini hanya membaca;
// keputusan lewat tombol di PaymentConfirmationPanel (Server Action POST).
export default async function PaymentConfirmationPage({ params, searchParams }: Props) {
  const [{ token }, query] = await Promise.all([params, searchParams]);
  const result = await lookupPaymentConfirmation(token);

  if (!result.ok) {
    const invalid = result.status === 410 || result.status === 400;
    return (
      <AuthShell>
        <AuthHeading
          title={invalid ? "Tautan tidak valid" : "Konfirmasi tidak dapat dimuat"}
          description={invalid ? "Tautan konfirmasi ini tidak dikenali. Periksa kembali tautan di email, atau putuskan lewat panel super-admin." : "Silakan muat ulang halaman ini beberapa saat lagi."}
        />
        {invalid ? null : <FormAlert tone="danger">{result.error}</FormAlert>}
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      {query.proof === "error" ? <FormAlert tone="danger">Bukti bayar tidak dapat dibuka. Coba lagi beberapa saat lagi.</FormAlert> : null}
      <PaymentConfirmationPanel token={token} initial={result.data} />
    </AuthShell>
  );
}

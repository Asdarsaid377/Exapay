"use client";

import { CloudOff, RotateCw } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/common/Button";
import { BackdropShapes } from "@/components/layout/BackdropShapes";

type Props = {
  error: Error & { digest?: string };
  // Next 16: render ulang segmen dari server
  retry: () => void;
};

// Gangguan tak terduga di halaman mana pun — terutama API tidak terjangkau (SessionUnavailableError dari getSession).
// Sesi TIDAK diakhiri: user cukup mencoba lagi. Pesan asli tidak ditampilkan (di production disamarkan Next).
export default function AppError({ error, retry }: Props) {
  const [retrying, setRetrying] = useState(false);

  return (
    <main className="flex min-h-dvh items-center justify-center px-3.5 py-10">
      <BackdropShapes variant="auth" />
      <section className="glass-strong flex w-full max-w-md flex-col items-center gap-3 rounded-card px-6 py-12 text-center sm:px-8">
        <CloudOff aria-hidden className="size-7 text-accent-strong" />
        <div className="flex flex-col gap-1.5">
          <h1 className="font-display text-base font-bold text-text-primary">Server Exapay sedang tidak dapat dihubungi</h1>
          <p className="text-sm text-text-secondary text-pretty">
            Anda tetap masuk — tidak ada data yang hilang. Periksa koneksi internet Anda lalu coba lagi beberapa saat lagi.
          </p>
          {error.digest ? <p className="text-caption text-text-tertiary">Kode: {error.digest}</p> : null}
        </div>
        <Button
          className="mt-2"
          loading={retrying}
          onClick={() => {
            setRetrying(true);
            retry();
            // retry() tidak mengembalikan promise; aktifkan tombol lagi jika masih gagal
            setTimeout(() => setRetrying(false), 1500);
          }}
        >
          {retrying ? null : <RotateCw aria-hidden className="size-4" />}
          Coba lagi
        </Button>
      </section>
    </main>
  );
}

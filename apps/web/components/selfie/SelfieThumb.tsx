"use client";

import type { SelfieState } from "@exapay/shared";
import { RefreshCw } from "lucide-react";
import { useState } from "react";

type Props = {
  state: SelfieState | null;
  src: string;
  // Teks aksesibel tombol, mis. "Lihat selfie absen masuk 5 Okt"
  label: string;
  onOpen: () => void;
  // sm: 32px kotak (tabel) · md: 36px bulat (riwayat portal) · lg: 44px bulat (kartu absen portal)
  size?: "sm" | "md" | "lg";
  // Tampilkan "—" untuk absen tanpa selfie (kolom tabel); selain itu tidak menampilkan apa pun
  showNone?: boolean;
};

const SIZE = { sm: "size-8 rounded-[10px]", md: "size-9 rounded-full", lg: "size-11 rounded-full" } as const;

// Thumbnail selfie (design selfie-components "SelfieThumb"): ada · memuat · gagal dimuat · sudah dihapus · tanpa selfie.
// Sejajar jam — tidak menambah tinggi baris. Foto dimuat lewat Route Handler web (akses dicek API).
export function SelfieThumb({ state, src, label, onOpen, size = "sm", showNone = false }: Props) {
  const [status, setStatus] = useState<"loading" | "ready" | "failed">("loading");
  const [attempt, setAttempt] = useState(0);

  if (state === null) return showNone ? <span aria-label="Tanpa selfie" className="text-sm text-text-muted">—</span> : null;
  if (state === "expired") return <span className="text-caption whitespace-nowrap text-text-muted">Foto dihapus</span>;

  const shape = SIZE[size];
  if (status === "failed") {
    return (
      <button
        type="button"
        aria-label="Foto tidak dapat dibuka, coba lagi"
        onClick={() => {
          setStatus("loading");
          setAttempt((n) => n + 1);
        }}
        className={`${shape} grid shrink-0 place-items-center border border-dashed border-danger/50 bg-danger/5 transition-colors hover:bg-danger/10 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-accent/45`}
      >
        <RefreshCw aria-hidden className="size-3.5 text-danger-text" />
      </button>
    );
  }

  return (
    <button
      type="button"
      aria-label={label}
      onClick={onOpen}
      className={`${shape} relative shrink-0 overflow-hidden border border-border-subtle bg-photo-placeholder transition-shadow hover:border-accent hover:ring-3 hover:ring-accent/22 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-accent/45 ${status === "loading" ? "animate-exa-pulse" : ""}`}
    >
      <img
        key={attempt}
        src={attempt > 0 ? `${src}?r=${attempt}` : src}
        alt=""
        loading="lazy"
        onLoad={() => setStatus("ready")}
        onError={() => setStatus("failed")}
        className={`size-full object-cover ${status === "ready" ? "" : "opacity-0"}`}
      />
    </button>
  );
}

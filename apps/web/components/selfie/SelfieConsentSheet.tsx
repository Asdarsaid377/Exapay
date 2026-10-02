"use client";

import { Button } from "@/components/common/Button";
import { Dialog } from "@/components/common/Dialog";

type Props = {
  open: boolean;
  onAccept: () => void;
  onLater: () => void;
};

const POINTS = [
  "Foto diambil setiap absen masuk dan pulang.",
  "Hanya dilihat pemilik/admin dan atasan langsung Anda.",
  "Disimpan 90 hari, lalu dihapus otomatis.",
  "Tidak dipakai untuk pengenalan wajah.",
] as const;

// Pemberitahuan sekali sebelum selfie pertama (design me-attendance-selfie "SelfieConsentSheet"): empat poin teks
// berpemisah garis, tanpa ikon. Mobile = sheet dari bawah (Dialog).
export function SelfieConsentSheet({ open, onAccept, onLater }: Props) {
  return (
    <Dialog
      open={open}
      onClose={onLater}
      title="Selfie untuk bukti kehadiran"
      footer={
        <>
          <Button variant="secondary" onClick={onLater}>
            Nanti
          </Button>
          <Button onClick={onAccept}>Mengerti, buka kamera</Button>
        </>
      }
    >
      <ul className="flex flex-col divide-y divide-border-subtle">
        {POINTS.map((point) => (
          <li key={point} className="py-3 text-[15px] text-pretty text-text-primary first:pt-0">
            {point}
          </li>
        ))}
      </ul>
    </Dialog>
  );
}

"use client";

import type { RosterCopyResult } from "@exapay/shared";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { copyRosterWeek } from "@/actions/shiftRoster";
import { Button } from "@/components/common/Button";
import { Dialog } from "@/components/common/Dialog";
import { FormAlert } from "@/components/common/FormAlert";
import { addIsoDays, weekRangeLabel } from "@/lib/shiftLabels";

type Props = {
  open: boolean;
  onClose: () => void;
  weekStart: string;
  departmentId: string | null;
};

// Konfirmasi "Salin minggu lalu" (design attendance-roster "CopyWeekDialog"): hitungan dari API (dryRun) — sel diisi,
// sel terkunci dilewati, sel terisi ditimpa. Dipasang ulang tiap dibuka.
export function CopyRosterWeekDialog({ open, onClose, weekStart, departmentId }: Props) {
  const router = useRouter();
  const [preview, setPreview] = useState<RosterCopyResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    copyRosterWeek({ week: weekStart, departmentId, dryRun: true })
      .then((outcome) => {
        if (!active) return;
        if (outcome.kind === "error") setError(outcome.message);
        else setPreview(outcome.result);
      })
      .catch(() => active && setError("Tidak dapat terhubung ke server. Periksa koneksi Anda lalu coba lagi."));
    return () => {
      active = false;
    };
  }, [weekStart, departmentId]);

  async function confirm() {
    setError(null);
    setSubmitting(true);
    try {
      const outcome = await copyRosterWeek({ week: weekStart, departmentId, dryRun: false });
      if (outcome.kind === "error") {
        setError(outcome.message);
        return;
      }
      onClose();
      router.refresh();
    } catch {
      setError("Tidak dapat terhubung ke server. Periksa koneksi Anda lalu coba lagi.");
    } finally {
      setSubmitting(false);
    }
  }

  const previous = weekRangeLabel(addIsoDays(weekStart, -7), addIsoDays(weekStart, -1)).replace(/ \d{4}$/, "");
  const target = weekRangeLabel(weekStart, addIsoDays(weekStart, 6)).replace(/ \d{4}$/, "");
  const nothing = preview !== null && preview.filled === 0;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      dismissible={!submitting}
      title={`Salin roster ${previous} ke ${target}?`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Batal
          </Button>
          <Button onClick={confirm} loading={submitting} disabled={preview === null || nothing}>
            {submitting ? "Menyalin…" : "Salin roster"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {error ? <FormAlert tone="danger">{error}</FormAlert> : null}
        {preview === null && !error ? (
          <div aria-busy="true" className="flex flex-col gap-3">
            <span className="h-3 w-40 animate-exa-pulse rounded-full bg-fill" />
            <span className="h-3 w-48 animate-exa-pulse rounded-full bg-fill" />
          </div>
        ) : null}
        {preview ? (
          nothing ? (
            <p className="text-[14.5px] text-text-secondary">Tidak ada jadwal minggu lalu yang bisa disalin{preview.skippedLocked > 0 ? ` — ${preview.skippedLocked} sel terkunci dilewati` : ""}.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border-subtle text-[14.5px] text-text-primary tabular-nums">
              <li className="pb-2.5">{preview.filled} sel akan diisi</li>
              {preview.skippedLocked > 0 ? <li className="py-2.5">{preview.skippedLocked} sel terkunci dilewati</li> : null}
              {preview.skippedDeletedShift > 0 ? <li className="py-2.5">{preview.skippedDeletedShift} sel memakai shift yang sudah dihapus — dilewati</li> : null}
              <li className="pt-2.5">{preview.overwritten > 0 ? `${preview.overwritten} sel yang sudah diisi akan ditimpa` : "Sel yang sudah diisi akan ditimpa"}</li>
            </ul>
          )
        ) : null}
        <p className="text-caption text-text-tertiary">Karyawan yang jadwalnya berubah diberi tahu lewat email. Tercatat di log audit.</p>
      </div>
    </Dialog>
  );
}

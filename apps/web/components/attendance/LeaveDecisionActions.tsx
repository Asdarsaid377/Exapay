"use client";

import { LEAVE_TYPE_LABELS, type LeaveDecision, type LeaveRequestListItem, leaveDecisionSchema } from "@exapay/shared";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import { decideLeaveRequest } from "@/actions/leaveRequests";
import { Button } from "@/components/common/Button";
import { Dialog } from "@/components/common/Dialog";
import { FormAlert } from "@/components/common/FormAlert";
import { TextAreaField } from "@/components/common/TextAreaField";
import { formatDateRange, workingDaysLabel } from "@/lib/leaveLabels";

type Props = {
  request: LeaveRequestListItem;
  // Tombol selebar kolom (card mobile)
  fullWidth?: boolean;
};

// Setujui / tolak pengajuan (atasan langsung, owner/admin). Menolak wajib beralasan; menyetujui boleh dengan catatan.
export function LeaveDecisionActions({ request, fullWidth = false }: Props) {
  const router = useRouter();
  // Dirender dua kali (tabel desktop + card mobile) — id statis akan bentrok
  const noteId = useId();
  const [decision, setDecision] = useState<LeaveDecision | null>(null);
  const [note, setNote] = useState("");
  const [noteError, setNoteError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function openDialog(next: LeaveDecision) {
    setNote("");
    setNoteError(null);
    setFormError(null);
    setDecision(next);
  }

  async function submit() {
    if (!decision) return;
    setFormError(null);
    const parsed = leaveDecisionSchema.safeParse({ decision, note });
    if (!parsed.success) {
      setNoteError(parsed.error.issues[0]?.message ?? "Catatan tidak valid");
      return;
    }
    setNoteError(null);
    setSubmitting(true);
    try {
      const outcome = await decideLeaveRequest(request.id, { decision, note: parsed.data.note });
      if (outcome.kind === "error") {
        setFormError(outcome.message);
        return;
      }
      setDecision(null);
      router.refresh();
    } catch {
      setFormError("Tidak dapat terhubung ke server. Periksa koneksi Anda lalu coba lagi.");
    } finally {
      setSubmitting(false);
    }
  }

  const summary = `${request.employee.fullName} · ${LEAVE_TYPE_LABELS[request.type]} · ${formatDateRange(request.startDate, request.endDate)} (${workingDaysLabel(request.workingDays)})`;
  const approving = decision === "approve";
  return (
    <>
      <div className={fullWidth ? "grid grid-cols-2 gap-2.5" : "flex justify-end gap-2"}>
        <Button variant="secondary" onClick={() => openDialog("reject")} fullWidth={fullWidth}>
          Tolak
        </Button>
        <Button onClick={() => openDialog("approve")} fullWidth={fullWidth}>
          Setujui
        </Button>
      </div>
      <Dialog
        open={decision !== null}
        onClose={() => setDecision(null)}
        dismissible={!submitting}
        title={approving ? "Setujui pengajuan?" : "Tolak pengajuan"}
        description={summary}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDecision(null)} disabled={submitting}>
              Batal
            </Button>
            <Button variant={approving ? "primary" : "danger"} onClick={submit} loading={submitting}>
              {submitting ? "Menyimpan…" : approving ? "Setujui" : "Tolak pengajuan"}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {formError ? <FormAlert tone="danger">{formError}</FormAlert> : null}
          <p className="rounded-inner bg-fill-subtle px-3.5 py-3 text-sm text-pretty break-words text-text-primary">{request.reason}</p>
          <TextAreaField
            id={noteId}
            label={approving ? "Catatan (opsional)" : "Alasan penolakan"}
            placeholder={approving ? "Mis. semoga lekas sembuh" : "Mis. stok opname minggu ini, mohon ajukan tanggal lain"}
            hint={approving ? undefined : "Alasan ini dibaca karyawan."}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            error={noteError ?? undefined}
            disabled={submitting}
          />
        </div>
      </Dialog>
    </>
  );
}

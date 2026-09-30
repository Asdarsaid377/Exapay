"use client";

import { type TaskDecision, taskDecisionSchema, type TaskVerificationItem } from "@exapay/shared";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import { decideTaskLog } from "@/actions/taskVerification";
import { Button } from "@/components/common/Button";
import { Dialog } from "@/components/common/Dialog";
import { FormAlert } from "@/components/common/FormAlert";
import { TextAreaField } from "@/components/common/TextAreaField";
import { TextField } from "@/components/common/TextField";
import { longDate, normalizeQuantityInput, targetLabel } from "@/lib/taskLogLabels";
import { itemQuantity, itemTitle } from "@/lib/taskVerificationLabels";

type Props = {
  item: TaskVerificationItem;
};

type FieldErrors = { quantity?: string; note?: string };

const TITLES: Record<TaskDecision, string> = {
  approve: "Setujui catatan?",
  reject: "Tolak catatan",
  correct: "Koreksi angka",
};

const SUBMIT_LABELS: Record<TaskDecision, string> = {
  approve: "Setujui",
  reject: "Tolak catatan",
  correct: "Simpan koreksi",
};

// Setujui / tolak (beralasan) / koreksi angka (beralasan) satu catatan tugas — pola LeaveDecisionActions (feature 20).
// Koreksi hanya untuk catatan indikator; hasilnya disetujui dengan angka koreksi.
export function TaskDecisionActions({ item }: Props) {
  const router = useRouter();
  const noteId = useId();
  const quantityId = useId();
  const [decision, setDecision] = useState<TaskDecision | null>(null);
  const [quantity, setQuantity] = useState("");
  const [note, setNote] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function openDialog(next: TaskDecision) {
    setQuantity(item.quantity?.replace(".", ",") ?? "");
    setNote("");
    setFieldErrors({});
    setFormError(null);
    setDecision(next);
  }

  async function submit() {
    if (!decision) return;
    setFormError(null);
    const parsed = taskDecisionSchema.safeParse({
      decision,
      version: item.version,
      quantity: decision === "correct" ? normalizeQuantityInput(quantity) : "",
      note,
    });
    const errors: FieldErrors = {};
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if ((field === "quantity" || field === "note") && !errors[field]) errors[field] = issue.message;
      }
    } else if (decision === "correct" && parsed.data.quantity) {
      if (item.indicator?.type === "count" && !/^[0-9]+$/.test(parsed.data.quantity)) errors.quantity = "Realisasi berupa bilangan bulat";
      else if (item.quantity !== null && Number(parsed.data.quantity) === Number(item.quantity)) errors.quantity = "Angka sama dengan angka karyawan — pilih Setujui";
    }
    setFieldErrors(errors);
    if (!parsed.success || errors.quantity || errors.note) return;

    setSubmitting(true);
    try {
      const outcome = await decideTaskLog(item.id, parsed.data);
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

  const quantityLabel = itemQuantity(item);
  const summary = `${item.employee.fullName} · ${longDate(item.workDate)}`;
  const approving = decision === "approve";
  return (
    <>
      <div className="flex flex-wrap justify-end gap-2 max-sm:grid max-sm:grid-cols-[repeat(auto-fit,minmax(0,1fr))]">
        <Button variant="secondary" onClick={() => openDialog("reject")}>
          Tolak
        </Button>
        {item.indicator ? (
          <Button variant="secondary" onClick={() => openDialog("correct")}>
            Koreksi
          </Button>
        ) : null}
        <Button onClick={() => openDialog("approve")}>Setujui</Button>
      </div>
      <Dialog
        open={decision !== null}
        onClose={() => setDecision(null)}
        dismissible={!submitting}
        title={decision ? TITLES[decision] : ""}
        description={summary}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDecision(null)} disabled={submitting}>
              Batal
            </Button>
            <Button variant={decision === "reject" ? "danger" : "primary"} onClick={submit} loading={submitting}>
              {submitting ? "Menyimpan…" : decision ? SUBMIT_LABELS[decision] : ""}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {formError ? <FormAlert tone="danger">{formError}</FormAlert> : null}
          <div className="flex flex-col gap-0.5 rounded-inner bg-fill-subtle px-3.5 py-3 text-text-primary">
            <span className="text-[14.5px] font-bold">{itemTitle(item)}</span>
            {quantityLabel ? <span className="font-display text-[15px] font-extrabold tabular-nums">{quantityLabel}</span> : null}
            {item.note ? <p className="text-small text-pretty break-words">{item.note}</p> : null}
          </div>
          {decision === "correct" && item.indicator ? (
            <TextField
              id={quantityId}
              label={`Realisasi yang benar (${item.indicator.unit})`}
              inputMode={item.indicator.type === "count" ? "numeric" : "decimal"}
              autoComplete="off"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              error={fieldErrors.quantity}
              hint={`${targetLabel(item.indicator.target, item.indicator.unit, item.indicator.targetPeriod)}. Angka ini yang masuk skor KPI.`}
              disabled={submitting}
            />
          ) : null}
          <TextAreaField
            id={noteId}
            label={approving ? "Catatan (opsional)" : decision === "correct" ? "Alasan koreksi" : "Alasan penolakan"}
            placeholder={approving ? "Mis. mantap, pertahankan" : decision === "correct" ? "Mis. bukti hanya menunjukkan 2 kunjungan" : "Mis. tidak ada bukti kunjungan"}
            hint={approving ? undefined : "Alasan ini dibaca karyawan."}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            error={fieldErrors.note}
            disabled={submitting}
          />
        </div>
      </Dialog>
    </>
  );
}

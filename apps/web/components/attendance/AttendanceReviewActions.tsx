"use client";

import { ATTENDANCE_REVIEW_DECISION_LABELS, type AttendanceReviewDecision, type AttendanceReviewItem, attendanceReviewDecisionSchema } from "@exapay/shared";
import { ArrowUpRight, MoreHorizontal, Pencil } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import { decideAttendanceReview } from "@/actions/workLocations";
import { AttendanceFlag } from "@/components/attendance/AttendanceFlag";
import { Badge } from "@/components/common/Badge";
import { Button } from "@/components/common/Button";
import { Dialog } from "@/components/common/Dialog";
import { DropdownMenu } from "@/components/common/DropdownMenu";
import { FormAlert } from "@/components/common/FormAlert";
import { TextAreaField } from "@/components/common/TextAreaField";
import { formatIsoDate } from "@/lib/datetime";
import { DECISION_TONES, eventLabel, formatReviewedAt } from "@/lib/workLocationLabels";

type Props = {
  item: AttendanceReviewItem;
  timeZone: string;
  // Tautan "Buka koreksi absensi" — hanya owner/admin (null untuk atasan)
  correctionHref: string | null;
  // Tombol selebar card (mobile)
  fullWidth?: boolean;
};

const MENU_ITEM =
  "flex min-h-11 w-full items-center gap-2.5 rounded-inner px-3 text-left text-sm font-medium text-text-primary transition-colors hover:bg-accent/10 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-accent/45";

// Keputusan tinjauan per absen (design attendance-review: tombol Diterima / Perlu tindak lanjut, "ReviewDecisionBadge" + ⋯ Ubah keputusan,
// "ReviewDecisionDialog"). Catatan wajib untuk tindak lanjut. Dirender dua kali (tabel + card) → id textarea dari useId.
export function AttendanceReviewActions({ item, timeZone, correctionHref, fullWidth = false }: Props) {
  const router = useRouter();
  const noteId = useId();
  const [decision, setDecision] = useState<AttendanceReviewDecision | null>(null);
  const [note, setNote] = useState("");
  const [noteError, setNoteError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function openDialog(next: AttendanceReviewDecision) {
    // Ubah keputusan: catatan lama ikut terisi agar bisa disunting
    setNote(item.review?.note ?? "");
    setNoteError(null);
    setFormError(null);
    setDecision(next);
  }

  async function submit() {
    if (!decision) return;
    setFormError(null);
    const parsed = attendanceReviewDecisionSchema.safeParse({ decision, note });
    if (!parsed.success) {
      setNoteError(parsed.error.issues[0]?.message ?? "Catatan tidak valid");
      return;
    }
    setNoteError(null);
    setSubmitting(true);
    try {
      const outcome = await decideAttendanceReview(item.recordId, item.event, parsed.data);
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

  const review = item.review;
  const followUp = decision === "follow_up";

  return (
    <>
      {review ? (
        <div className="flex items-start gap-2.5">
          <div className="flex min-w-0 flex-1 flex-col items-start gap-1.25">
            <Badge tone={DECISION_TONES[review.decision]}>{ATTENDANCE_REVIEW_DECISION_LABELS[review.decision]}</Badge>
            <span className="text-caption text-text-tertiary tabular-nums">
              {[review.reviewedByName, formatReviewedAt(review.reviewedAt, timeZone)].filter(Boolean).join(" · ")}
            </span>
            {review.note ? <span className="text-[13.5px] text-pretty break-words text-neutral-text">“{review.note}”</span> : null}
          </div>
          {item.canReview ? (
            <DropdownMenu
              label={`Aksi lain untuk absen ${item.employee.fullName}`}
              align="end"
              panelClassName="w-57.5"
              triggerClassName="grid size-8 shrink-0 place-items-center rounded-full border border-border-control bg-control text-text-primary transition-colors hover:bg-surface-solid max-lg:size-11"
              trigger={<MoreHorizontal aria-hidden className="size-4" />}
            >
              {(close) => (
                <button
                  type="button"
                  className={MENU_ITEM}
                  onClick={() => {
                    close();
                    openDialog(review.decision === "accepted" ? "follow_up" : "accepted");
                  }}
                >
                  <Pencil aria-hidden className="size-4.5 text-text-secondary" />
                  Ubah keputusan
                </button>
              )}
            </DropdownMenu>
          ) : null}
        </div>
      ) : item.canReview ? (
        <div className={fullWidth ? "grid grid-cols-[0.8fr_1.2fr] gap-2" : "flex justify-end gap-2"}>
          <Button variant="secondary" fullWidth={fullWidth} className={fullWidth ? "h-11" : "h-9 px-4 text-[13.5px]"} onClick={() => openDialog("accepted")}>
            Diterima
          </Button>
          <Button
            variant="secondary"
            fullWidth={fullWidth}
            className={`border-warning/45 text-warning-text hover:border-warning hover:bg-warning-surface ${fullWidth ? "h-11" : "h-9 px-4 text-[13.5px]"}`}
            onClick={() => openDialog("follow_up")}
          >
            Perlu tindak lanjut
          </Button>
        </div>
      ) : (
        <span className="text-small text-text-secondary">Absen Anda — ditinjau pemilik atau admin lain</span>
      )}

      <Dialog
        open={decision !== null}
        onClose={() => setDecision(null)}
        dismissible={!submitting}
        title={followUp ? "Tandai perlu tindak lanjut?" : `Terima absen ${item.employee.fullName}?`}
        footer={
          <>
            {followUp && correctionHref ? (
              <Link
                href={correctionHref}
                className="inline-flex min-h-11 items-center justify-center gap-1.5 text-sm font-bold text-accent-strong hover:text-accent-hover hover:underline sm:mr-auto"
              >
                Buka koreksi absensi
                <ArrowUpRight aria-hidden className="size-3.75" />
              </Link>
            ) : null}
            <Button variant="secondary" onClick={() => setDecision(null)} disabled={submitting}>
              Batal
            </Button>
            <Button onClick={submit} loading={submitting}>
              {submitting ? "Menyimpan…" : followUp ? "Tandai" : "Terima absen"}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {formError ? <FormAlert tone="danger">{formError}</FormAlert> : null}
          <div className="flex flex-col gap-2 rounded-[16px] border border-border-subtle bg-surface-solid px-4 py-3.5">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
              <span className="text-[14.5px] font-bold">{item.employee.fullName}</span>
              <span className="text-sm font-medium tabular-nums">
                {formatIsoDate(item.workDate)} · {eventLabel(item.event, item.at, timeZone)}
              </span>
            </div>
            <AttendanceFlag flag={item.flag} layout="inline" />
          </div>
          <TextAreaField
            id={noteId}
            label={followUp ? "Catatan" : "Catatan (opsional)"}
            requiredMark={followUp}
            placeholder={followUp ? "Tulis alasan atau langkah berikutnya" : "mis. Antar pesanan ke pelanggan"}
            hint="Tercatat di log audit."
            value={note}
            onChange={(e) => setNote(e.target.value)}
            error={noteError ?? undefined}
            disabled={submitting}
            maxLength={500}
          />
        </div>
      </Dialog>
    </>
  );
}

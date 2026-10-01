"use client";

import { KPI_SUMMARY_MAX_LENGTH, type KpiReviewSummary } from "@exapay/shared";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";

import { generateKpiReviewSummary, markKpiReviewSummaryReviewed, saveKpiReviewSummary } from "@/actions/kpiReviews";
import { Badge, type BadgeTone } from "@/components/common/Badge";
import { Button } from "@/components/common/Button";
import { Dialog } from "@/components/common/Dialog";
import { FormAlert } from "@/components/common/FormAlert";
import { TextAreaField } from "@/components/common/TextAreaField";
import { formatDateTime, formatIsoDate } from "@/lib/datetime";

type Props = {
  reviewId: string;
  summary: KpiReviewSummary;
  // Boleh generate / edit / tandai ditinjau (penilai yang berwenang, penilaian belum final)
  canWrite: boolean;
  final: boolean;
};

type Pending = "generate" | "save" | "review" | null;

const POLL_MS = 3000;
const OFFLINE = "Tidak dapat terhubung ke server. Periksa koneksi Anda lalu coba lagi.";

function statusOf(summary: KpiReviewSummary, final: boolean): { tone: BadgeTone; label: string } | null {
  if (summary.generation?.pending) return { tone: "info", label: "Sedang dibuat" };
  if (!summary.body) return summary.generation?.status === "failed" ? { tone: "danger", label: "Gagal dibuat" } : null;
  if (final || summary.reviewedAt) return { tone: "success", label: "Sudah ditinjau" };
  return { tone: "warning", label: "Menunggu ditinjau" };
}

function originOf(summary: KpiReviewSummary): string {
  if (summary.source === "manual") return "Ditulis manual";
  if (summary.source === "edited") return "Dibuat AI, diubah manual";
  return "Dibuat AI";
}

// Ringkasan kinerja / narasi AI penilaian KPI (feature 23). AI hanya menulis draf dari skor & rincian (tanpa nama karyawan);
// penilai meninjau, mengubah, atau menulis sendiri. Selama AI menulis, halaman dimuat ulang tiap 3 detik.
// Tanpa referensi desain — pola card glass-strong detail penilaian + TextAreaField + Dialog (izin user).
export function KpiReviewSummaryPanel({ reviewId, summary, canWrite, final }: Props) {
  const router = useRouter();
  const textareaId = useId();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [confirmRegenerate, setConfirmRegenerate] = useState(false);
  const [pending, setPending] = useState<Pending>(null);
  const [error, setError] = useState<string | null>(null);

  const generating = summary.generation?.pending ?? false;
  const quota = summary.quota;
  const quotaLeft = quota ? quota.limit - quota.used : 0;
  const status = statusOf(summary, final);

  useEffect(() => {
    if (!generating) return;
    const timer = setInterval(() => router.refresh(), POLL_MS);
    return () => clearInterval(timer);
  }, [generating, router]);

  async function run(kind: Exclude<Pending, null>, action: () => Promise<{ kind: "error"; message: string } | { kind: "success" }>): Promise<boolean> {
    setError(null);
    setPending(kind);
    try {
      const outcome = await action();
      if (outcome.kind === "error") {
        setError(outcome.message);
        return false;
      }
      router.refresh();
      return true;
    } catch {
      setError(OFFLINE);
      return false;
    } finally {
      setPending(null);
    }
  }

  async function generate() {
    setConfirmRegenerate(false);
    await run("generate", () => generateKpiReviewSummary(reviewId, { version: summary.version }));
  }

  async function save() {
    if (await run("save", () => saveKpiReviewSummary(reviewId, { version: summary.version, body: draft }))) setEditing(false);
  }

  function startEditing() {
    setDraft(summary.body ?? "");
    setError(null);
    setEditing(true);
  }

  const busy = pending !== null || generating;
  const canGenerate = canWrite && quota !== null && quotaLeft > 0;

  return (
    <section className="glass-strong flex flex-col gap-5 rounded-card p-5 lg:p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="font-display text-h2 font-bold text-text-primary">Ringkasan kinerja</h2>
          <p className="text-small text-text-secondary text-pretty">
            {final
              ? "Narasi ikut dikunci bersama skor final."
              : "Draf dibuat AI dari skor dan rincian di halaman ini, tanpa nama karyawan. Wajib ditinjau sebelum penilaian difinalkan."}
          </p>
        </div>
        {status ? <Badge tone={status.tone}>{status.label}</Badge> : null}
      </div>

      {error ? <FormAlert tone="danger">{error}</FormAlert> : null}
      {!generating && summary.generation?.status === "failed" && summary.generation.error ? (
        <FormAlert tone="danger">{summary.generation.error}</FormAlert>
      ) : null}

      {editing ? (
        <div className="flex flex-col gap-4">
          <TextAreaField
            id={textareaId}
            label="Narasi ringkasan"
            rows={10}
            value={draft}
            maxLength={KPI_SUMMARY_MAX_LENGTH}
            onChange={(event) => setDraft(event.target.value)}
            disabled={pending !== null}
            hint={`${draft.length}/${KPI_SUMMARY_MAX_LENGTH} karakter. Menyimpan berarti Anda sudah meninjau narasi ini.`}
          />
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={() => setEditing(false)} disabled={pending !== null}>
              Batal
            </Button>
            <Button onClick={save} loading={pending === "save"} disabled={pending !== null || draft.trim().length === 0}>
              {pending === "save" ? "Menyimpan…" : "Simpan & tandai ditinjau"}
            </Button>
          </div>
        </div>
      ) : generating ? (
        <div className="flex flex-col gap-3" aria-live="polite">
          <div className="h-3.5 w-full animate-exa-pulse rounded-full bg-text-primary/9" />
          <div className="h-3.5 w-11/12 animate-exa-pulse rounded-full bg-text-primary/7 [animation-delay:150ms]" />
          <div className="h-3.5 w-4/5 animate-exa-pulse rounded-full bg-text-primary/7 [animation-delay:300ms]" />
          <p className="text-small text-text-secondary">AI sedang menulis ringkasan. Biasanya selesai kurang dari satu menit.</p>
        </div>
      ) : summary.body ? (
        <div className="flex flex-col gap-3">
          <p className="text-body whitespace-pre-line text-text-primary text-pretty">{summary.body}</p>
          <p className="text-caption text-text-tertiary">
            {originOf(summary)}
            {summary.reviewedAt ? ` · ditinjau ${summary.reviewedByName ?? "pengguna"} pada ${formatDateTime(summary.reviewedAt)}` : " · belum ditinjau"}
          </p>
        </div>
      ) : (
        <p className="text-small text-text-secondary text-pretty">
          {final ? "Penilaian ini difinalkan tanpa ringkasan kinerja." : canWrite ? "Belum ada ringkasan. Buat draf dengan AI atau tulis sendiri." : "Belum ada ringkasan."}
        </p>
      )}

      {canWrite && !editing ? (
        <div className="flex flex-col gap-3 border-t border-border-subtle pt-5">
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:flex-wrap sm:justify-end">
            <Button variant="secondary" onClick={startEditing} disabled={busy}>
              {summary.body ? "Ubah" : "Tulis sendiri"}
            </Button>
            <Button
              variant={summary.body ? "secondary" : "primary"}
              onClick={() => (summary.body ? setConfirmRegenerate(true) : generate())}
              loading={pending === "generate"}
              disabled={busy || !canGenerate}
            >
              {pending === "generate" ? "Mengirim…" : summary.body || summary.generation ? "Buat ulang dengan AI" : "Buat dengan AI"}
            </Button>
            {summary.body && !summary.reviewedAt ? (
              <Button onClick={() => run("review", () => markKpiReviewSummaryReviewed(reviewId, { version: summary.version }))} loading={pending === "review"} disabled={busy}>
                {pending === "review" ? "Menyimpan…" : "Tandai sudah ditinjau"}
              </Button>
            ) : null}
          </div>
          {quota ? (
            <p className="text-caption text-text-tertiary sm:text-right">
              {quotaLeft > 0
                ? `Kuota AI bulan ini: ${quota.used} dari ${quota.limit} terpakai.`
                : `Kuota AI bulan ini habis (${quota.used}/${quota.limit}), terisi lagi ${formatIsoDate(quota.resetsOn)}. Anda tetap bisa menulis sendiri.`}
            </p>
          ) : null}
        </div>
      ) : null}

      <Dialog
        open={confirmRegenerate}
        onClose={() => setConfirmRegenerate(false)}
        title="Buat ulang ringkasan?"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmRegenerate(false)}>
              Batal
            </Button>
            <Button onClick={generate}>Buat ulang</Button>
          </>
        }
      >
        <p className="text-body text-text-primary text-pretty">
          Narasi yang ada akan diganti draf baru dari AI dan perlu ditinjau lagi. Satu kali buat ulang memakai satu kuota AI bulan ini.
        </p>
      </Dialog>
    </section>
  );
}

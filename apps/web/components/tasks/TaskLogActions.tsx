"use client";

import type { TaskIndicatorDay, TaskLog } from "@exapay/shared";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { deleteTaskLog } from "@/actions/taskLogs";
import { Button } from "@/components/common/Button";
import { Dialog } from "@/components/common/Dialog";
import { FormAlert } from "@/components/common/FormAlert";
import { TaskLogFormDialog } from "@/components/tasks/TaskLogFormDialog";

type Props = {
  log: TaskLog;
  indicators: TaskIndicatorDay[];
  // Mis. "Cup terjual · 40 cup"
  summary: string;
};

const LINK_CLASS = "-my-2 inline-flex min-h-11 items-center text-sm font-bold hover:underline focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-accent/45";

// Ubah / hapus catatan milik sendiri yang masih menunggu verifikasi (pola CancelLeaveRequestButton)
export function TaskLogActions({ log, indicators, summary }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function closeConfirm() {
    setError(null);
    setConfirming(false);
  }

  async function remove() {
    setError(null);
    setSubmitting(true);
    try {
      const outcome = await deleteTaskLog(log.id);
      if (outcome.kind === "error") {
        setError(outcome.message);
        return;
      }
      setConfirming(false);
      router.refresh();
    } catch {
      setError("Tidak dapat terhubung ke server. Periksa koneksi Anda lalu coba lagi.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex items-center gap-5">
      <button type="button" onClick={() => setEditing(true)} className={`${LINK_CLASS} text-accent-strong hover:text-accent-hover`}>
        Ubah
      </button>
      <button type="button" onClick={() => setConfirming(true)} className={`${LINK_CLASS} text-danger-text`}>
        Hapus
      </button>
      {/* key: form mengikuti isi terbaru catatan setelah disimpan */}
      <TaskLogFormDialog key={log.updatedAt} open={editing} onClose={() => setEditing(false)} workDate={log.workDate} indicators={indicators} log={log} />
      <Dialog
        open={confirming}
        onClose={closeConfirm}
        dismissible={!submitting}
        title="Hapus catatan?"
        description={`${summary}. Catatan dan fotonya dihapus permanen.`}
        footer={
          <>
            <Button variant="secondary" onClick={closeConfirm} disabled={submitting}>
              Kembali
            </Button>
            <Button variant="dark" onClick={remove} loading={submitting}>
              {submitting ? "Menghapus…" : "Hapus catatan"}
            </Button>
          </>
        }
      >
        {error ? <FormAlert tone="danger">{error}</FormAlert> : null}
      </Dialog>
    </div>
  );
}

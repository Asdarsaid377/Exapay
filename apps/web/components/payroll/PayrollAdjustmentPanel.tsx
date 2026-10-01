"use client";

import type { PayrollAdjustment, PayrollEmployeeStatus, PayrollSalaryItem } from "@exapay/shared";
import { Ban, CalendarX2, Plus, SlidersHorizontal } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { deletePayrollAdjustment } from "@/actions/payrollRuns";
import { Button } from "@/components/common/Button";
import { Dialog } from "@/components/common/Dialog";
import { FormAlert } from "@/components/common/FormAlert";
import { PayrollLineDialog } from "@/components/payroll/PayrollLineDialog";
import { PayrollOverrideDialog } from "@/components/payroll/PayrollOverrideDialog";
import { PayrollReasonDialog } from "@/components/payroll/PayrollReasonDialog";
import { formatDateTime } from "@/lib/datetime";
import { adjustmentTitle, adjustmentValue } from "@/lib/payrollRunLabels";

type Props = {
  runId: string;
  employeeId: string;
  employeeName: string;
  status: PayrollEmployeeStatus;
  adjustments: PayrollAdjustment[];
  // Komponen versi gaji periode ini (kosong = gaji belum diatur)
  salaryItems: PayrollSalaryItem[];
  // false = periode sudah final (feature 30)
  editable: boolean;
};

type Open =
  | { kind: "line"; adjustment?: PayrollAdjustment }
  | { kind: "override"; adjustment?: PayrollAdjustment }
  | { kind: "waive_attendance" }
  | { kind: "exclude" }
  | { kind: "delete"; adjustment: PayrollAdjustment }
  | null;

const NETWORK_ERROR = "Tidak dapat terhubung ke server. Periksa koneksi Anda lalu coba lagi.";

function removeLabel(adjustment: PayrollAdjustment): string {
  if (adjustment.kind === "waive_attendance") return "Terapkan lagi";
  if (adjustment.kind === "exclude") return "Ikutkan kembali";
  return "Hapus";
}

// Penyesuaian admin untuk satu karyawan di draf (feature 29): tambah pendapatan/potongan, ubah nominal komponen,
// batalkan potongan absensi, keluarkan dari periode. Tanpa referensi desain — pola card glass-strong + daftar
// berpemisah + Dialog (izin user).
export function PayrollAdjustmentPanel({ runId, employeeId, employeeName, status, adjustments, salaryItems, editable }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState<Open>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const excluded = status === "excluded";
  const waived = adjustments.some((adjustment) => adjustment.kind === "waive_attendance");

  async function confirmDelete(adjustment: PayrollAdjustment) {
    setError(null);
    setDeleting(true);
    try {
      const outcome = await deletePayrollAdjustment(runId, adjustment.id);
      if (outcome.kind === "error") {
        setError(outcome.message);
        return;
      }
      setOpen(null);
      router.refresh();
    } catch {
      setError(NETWORK_ERROR);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <section className="glass-strong flex flex-col gap-4 rounded-card p-5 lg:p-6">
      <div className="flex flex-col gap-1">
        <h2 className="font-display text-h2 font-bold text-text-primary">Penyesuaian periode ini</h2>
        <p className="text-small text-text-secondary text-pretty">
          Hanya berlaku untuk periode ini dan tercatat di log audit. Gaji tetap karyawan diubah di tab Gaji.
        </p>
      </div>

      {adjustments.length === 0 ? (
        <p className="text-small text-text-tertiary">Belum ada penyesuaian.</p>
      ) : (
        <ul className="flex flex-col">
          {adjustments.map((adjustment) => {
            const value = adjustmentValue(adjustment);
            const editableKind = adjustment.kind === "add_line" || adjustment.kind === "override_component";
            return (
              <li key={adjustment.id} className="flex flex-col gap-1.5 border-t border-border-subtle py-3 first:border-t-0 first:pt-0">
                <div className="flex items-start justify-between gap-3">
                  <span className="min-w-0 text-[14.5px] font-bold text-text-primary">{adjustmentTitle(adjustment)}</span>
                  {value ? <span className="font-display text-[16px] font-bold whitespace-nowrap text-text-primary tabular-nums">{value}</span> : null}
                </div>
                {adjustment.reason ? <p className="text-small text-text-secondary text-pretty">{adjustment.reason}</p> : null}
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                  <span className="text-caption text-text-tertiary">
                    {adjustment.createdByName ?? "Pengguna"} · {formatDateTime(adjustment.createdAt)}
                  </span>
                  {editable ? (
                    <span className="flex gap-3">
                      {editableKind ? (
                        <button
                          type="button"
                          className="text-small font-bold text-accent-strong hover:text-accent-hover"
                          onClick={() => setOpen(adjustment.kind === "add_line" ? { kind: "line", adjustment } : { kind: "override", adjustment })}
                        >
                          Ubah
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="text-small font-bold text-danger-text hover:opacity-80"
                        onClick={() => {
                          setError(null);
                          setOpen({ kind: "delete", adjustment });
                        }}
                      >
                        {removeLabel(adjustment)}
                      </button>
                    </span>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {editable && !excluded ? (
        <div className="flex flex-col gap-2 border-t border-border-subtle pt-4 sm:flex-row sm:flex-wrap">
          <Button variant="secondary" onClick={() => setOpen({ kind: "line" })} disabled={salaryItems.length === 0}>
            <Plus aria-hidden className="size-4" />
            Pendapatan / potongan
          </Button>
          <Button variant="secondary" onClick={() => setOpen({ kind: "override" })} disabled={salaryItems.length === 0}>
            <SlidersHorizontal aria-hidden className="size-4" />
            Ubah nominal
          </Button>
          {!waived ? (
            <Button variant="secondary" onClick={() => setOpen({ kind: "waive_attendance" })} disabled={status !== "calculated"}>
              <CalendarX2 aria-hidden className="size-4" />
              Batalkan potongan absensi
            </Button>
          ) : null}
          <Button variant="secondary" onClick={() => setOpen({ kind: "exclude" })}>
            <Ban aria-hidden className="size-4" />
            Keluarkan
          </Button>
        </div>
      ) : null}

      {open?.kind === "line" ? (
        <PayrollLineDialog open onClose={() => setOpen(null)} runId={runId} employeeId={employeeId} adjustment={open.adjustment} />
      ) : null}
      {open?.kind === "override" ? (
        <PayrollOverrideDialog open onClose={() => setOpen(null)} runId={runId} employeeId={employeeId} items={salaryItems} adjustment={open.adjustment} />
      ) : null}
      {open?.kind === "waive_attendance" || open?.kind === "exclude" ? (
        <PayrollReasonDialog open onClose={() => setOpen(null)} runId={runId} employeeId={employeeId} employeeName={employeeName} kind={open.kind} />
      ) : null}
      {open?.kind === "delete" ? (
        <Dialog
          open
          onClose={() => setOpen(null)}
          dismissible={!deleting}
          title={`${removeLabel(open.adjustment)}?`}
          description={`${adjustmentTitle(open.adjustment)} — angka draf dihitung ulang tanpa penyesuaian ini.`}
          footer={
            <>
              <Button variant="secondary" onClick={() => setOpen(null)} disabled={deleting}>
                Batal
              </Button>
              <Button variant="dark" onClick={() => confirmDelete(open.adjustment)} loading={deleting}>
                {deleting ? "Memproses…" : removeLabel(open.adjustment)}
              </Button>
            </>
          }
        >
          {error ? <FormAlert tone="danger">{error}</FormAlert> : null}
        </Dialog>
      ) : null}
    </section>
  );
}

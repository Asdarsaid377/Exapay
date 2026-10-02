"use client";

import type { WorkShift, WorkShiftList as WorkShiftListData } from "@exapay/shared";
import { MoreHorizontal, Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import { DeleteWorkShiftDialog } from "@/components/attendance/DeleteWorkShiftDialog";
import { WorkShiftFormDialog } from "@/components/attendance/WorkShiftFormDialog";
import { Button } from "@/components/common/Button";
import { DropdownMenu } from "@/components/common/DropdownMenu";
import { formatShiftDuration } from "@/lib/shiftLabels";

type Props = {
  data: WorkShiftListData;
};

type DialogState = { kind: "form"; shift: WorkShift | null } | { kind: "delete"; shift: WorkShift } | null;

const GRID = "lg:grid lg:grid-cols-[minmax(0,1fr)_140px_90px_minmax(0,1.2fr)_120px] lg:items-center lg:gap-4";
const MENU_ITEM =
  "flex min-h-11 w-full items-center gap-2.5 rounded-inner px-3 text-left text-sm font-bold text-danger-text transition-colors hover:bg-danger/8 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-accent/45";

// Isi section "Shift kerja" di Pengaturan › Absensi (design settings-attendance-shifts "ShiftMasterSection"):
// kosong = satu baris penjelasan + "Aktifkan shift" (usaha berjadwal tetap ringan); ada shift = tabel ringan
// (nama, jam, durasi, terjadwal minggu ini, Ubah/⋯ Hapus), mobile = daftar. Opsional per usaha (feature 46).
export function WorkShiftList({ data }: Props) {
  const [dialog, setDialog] = useState<DialogState>(null);
  const shifts = data.items;

  const dialogs = (
    <>
      {dialog?.kind === "form" ? <WorkShiftFormDialog open onClose={() => setDialog(null)} shift={dialog.shift} /> : null}
      {dialog?.kind === "delete" ? <DeleteWorkShiftDialog open onClose={() => setDialog(null)} shift={dialog.shift} /> : null}
    </>
  );

  if (shifts.length === 0) {
    return (
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
        <p className="max-w-155 text-[14.5px] text-pretty text-neutral-text">
          Usaha Anda memakai jadwal kerja di atas untuk semua karyawan. Aktifkan shift jika karyawan bekerja bergiliran (mis. pagi/siang/malam).
        </p>
        {data.canManage ? (
          <Button variant="secondary" className="max-sm:h-11.5 max-sm:w-full sm:h-10 sm:shrink-0" onClick={() => setDialog({ kind: "form", shift: null })}>
            Aktifkan shift
          </Button>
        ) : null}
        {dialogs}
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <div className={`hidden border-b border-border-subtle pb-2.5 text-caption font-bold text-text-secondary ${GRID}`}>
        <span>Nama</span>
        <span>Jam</span>
        <span>Durasi</span>
        <span>Terjadwal minggu ini</span>
        <span className="sr-only">Aksi</span>
      </div>
      <ul>
        {shifts.map((shift) => (
          <li key={shift.id} className={`flex min-h-15 items-center gap-3 border-t border-border-subtle first:border-t-0 lg:min-h-16 lg:first:border-t-0 ${GRID}`}>
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-[15px] font-bold text-text-primary">{shift.name}</span>
              {/* Mobile: jam · durasi di bawah nama */}
              <span className="text-[13.5px] text-neutral-text tabular-nums lg:hidden">
                {shift.startTime}–{shift.endTime} · {formatShiftDuration(shift.durationMinutes)}
              </span>
              {shift.overnight ? <span className="text-caption text-text-secondary">Selesai keesokan hari</span> : null}
            </div>
            <span className="hidden text-[15px] font-medium text-text-primary tabular-nums lg:block">
              {shift.startTime}–{shift.endTime}
            </span>
            <span className="hidden text-[14.5px] text-neutral-text tabular-nums lg:block">{formatShiftDuration(shift.durationMinutes)}</span>
            <span className="hidden text-[14.5px] text-neutral-text lg:block">{usageText(shift)}</span>
            {data.canManage ? (
              <div className="flex shrink-0 justify-end gap-2">
                <Button variant="secondary" className="hidden h-9 px-4 text-[13.5px] lg:inline-flex" onClick={() => setDialog({ kind: "form", shift })}>
                  Ubah
                </Button>
                <DropdownMenu
                  label={`Aksi lain untuk shift ${shift.name}`}
                  align="end"
                  panelClassName="w-50"
                  triggerClassName="grid size-11 shrink-0 place-items-center rounded-full border border-border-control bg-control text-text-primary transition-colors hover:border-border-control-hover hover:bg-surface-solid lg:size-9"
                  trigger={<MoreHorizontal aria-hidden className="size-4.5" />}
                >
                  {(close) => (
                    <>
                      <button
                        type="button"
                        className={`${MENU_ITEM} text-text-primary hover:bg-accent/10 lg:hidden`}
                        onClick={() => {
                          close();
                          setDialog({ kind: "form", shift });
                        }}
                      >
                        Ubah
                      </button>
                      <button
                        type="button"
                        className={MENU_ITEM}
                        onClick={() => {
                          close();
                          setDialog({ kind: "delete", shift });
                        }}
                      >
                        <Trash2 aria-hidden className="size-4.5" />
                        Hapus
                      </button>
                    </>
                  )}
                </DropdownMenu>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      {data.canManage ? (
        <div className="border-t border-border-subtle pt-4">
          <Button variant="secondary" className="h-11.5 max-sm:w-full sm:h-10" onClick={() => setDialog({ kind: "form", shift: null })}>
            <Plus aria-hidden className="size-4" />
            Tambah shift
          </Button>
        </div>
      ) : null}
      {dialogs}
    </div>
  );
}

// "4 karyawan · 14 hari ke depan" / "Belum terjadwal"
function usageText(shift: WorkShift): string {
  if (shift.employeesThisWeek === 0 && shift.upcomingAssignments === 0) return "Belum terjadwal";
  return `${shift.employeesThisWeek} karyawan · ${shift.upcomingAssignments} hari ke depan`;
}

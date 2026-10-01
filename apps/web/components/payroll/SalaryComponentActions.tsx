"use client";

import type { SalaryComponent } from "@exapay/shared";
import { Archive, ArchiveRestore, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { changeSalaryComponentStatus } from "@/actions/salary";
import { Button } from "@/components/common/Button";
import { Dialog } from "@/components/common/Dialog";
import { DropdownMenu } from "@/components/common/DropdownMenu";
import { FormAlert } from "@/components/common/FormAlert";
import { SalaryComponentFormDialog } from "@/components/payroll/SalaryComponentFormDialog";

type Props = {
  component: SalaryComponent;
};

type StatusAction = "archive" | "restore" | "delete";

const ITEM =
  "flex min-h-11 w-full items-center gap-2.5 rounded-inner px-3 text-left text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-accent/45";
const NETWORK_ERROR = "Tidak dapat terhubung ke server. Periksa koneksi Anda lalu coba lagi.";

const CONFIRM: Record<StatusAction, { title: (name: string) => string; description: string; button: string; busy: string }> = {
  archive: {
    title: (name) => `Arsipkan ${name}?`,
    description: "Komponen tidak bisa dipilih untuk gaji baru. Gaji karyawan yang sudah memakainya tetap berlaku sampai diubah.",
    button: "Arsipkan",
    busy: "Mengarsipkan…",
  },
  restore: {
    title: (name) => `Pulihkan ${name}?`,
    description: "Komponen bisa dipilih lagi untuk gaji karyawan.",
    button: "Pulihkan",
    busy: "Memulihkan…",
  },
  delete: {
    title: (name) => `Hapus ${name}?`,
    description: "Komponen dihapus dari daftar. Komponen yang sudah dipakai di gaji karyawan tidak bisa dihapus — arsipkan saja.",
    button: "Hapus",
    busy: "Menghapus…",
  },
};

// Menu aksi per komponen (pola OrgItemActions): ubah, arsipkan/pulihkan, hapus. Gaji pokok hanya bisa diubah.
export function SalaryComponentActions({ component }: Props) {
  const router = useRouter();
  const [dialog, setDialog] = useState<"edit" | StatusAction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const isBase = component.kind === "base_salary";
  const confirm = dialog === "edit" || dialog === null ? null : dialog;

  function open(next: "edit" | StatusAction) {
    setError(null);
    setDialog(next);
  }

  async function handleConfirm(action: StatusAction) {
    setError(null);
    setSubmitting(true);
    try {
      const outcome = await changeSalaryComponentStatus(component.id, action);
      if (outcome.kind === "error") {
        setError(outcome.message);
        return;
      }
      setDialog(null);
      router.refresh();
    } catch {
      setError(NETWORK_ERROR);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <DropdownMenu
        label={`Aksi untuk ${component.name}`}
        align="end"
        panelClassName="w-52"
        triggerClassName="grid size-10 place-items-center rounded-field text-text-secondary transition-colors hover:bg-glass-hover hover:text-text-primary"
        trigger={<MoreHorizontal aria-hidden className="size-5" />}
      >
        {(close) => (
          <>
            <button
              type="button"
              className={`${ITEM} text-text-primary hover:bg-accent/10`}
              onClick={() => {
                close();
                open("edit");
              }}
            >
              <Pencil aria-hidden className="size-4.5 text-text-secondary" />
              Ubah
            </button>
            {isBase ? null : (
              <button
                type="button"
                className={`${ITEM} text-text-primary hover:bg-accent/10`}
                onClick={() => {
                  close();
                  open(component.archived ? "restore" : "archive");
                }}
              >
                {component.archived ? (
                  <ArchiveRestore aria-hidden className="size-4.5 text-text-secondary" />
                ) : (
                  <Archive aria-hidden className="size-4.5 text-text-secondary" />
                )}
                {component.archived ? "Pulihkan" : "Arsipkan"}
              </button>
            )}
            {isBase || component.inUse ? null : (
              <button
                type="button"
                className={`${ITEM} font-bold text-danger-text hover:bg-danger/8`}
                onClick={() => {
                  close();
                  open("delete");
                }}
              >
                <Trash2 aria-hidden className="size-4.5" />
                Hapus
              </button>
            )}
          </>
        )}
      </DropdownMenu>
      <SalaryComponentFormDialog key={`${component.name}-${component.kind}`} open={dialog === "edit"} onClose={() => setDialog(null)} component={component} />
      {confirm ? (
        <Dialog
          open
          onClose={() => setDialog(null)}
          dismissible={!submitting}
          title={CONFIRM[confirm].title(component.name)}
          description={CONFIRM[confirm].description}
          footer={
            <>
              <Button variant="secondary" onClick={() => setDialog(null)} disabled={submitting}>
                Batal
              </Button>
              <Button variant={confirm === "restore" ? "primary" : "dark"} onClick={() => handleConfirm(confirm)} loading={submitting}>
                {submitting ? CONFIRM[confirm].busy : CONFIRM[confirm].button}
              </Button>
            </>
          }
        >
          {error ? <FormAlert tone="danger">{error}</FormAlert> : null}
        </Dialog>
      ) : null}
    </>
  );
}

"use client";

import type { WorkLocation } from "@exapay/shared";
import { MoreHorizontal, Trash2 } from "lucide-react";
import { useState } from "react";

import { DeleteWorkLocationDialog } from "@/components/attendance/DeleteWorkLocationDialog";
import { WorkLocationFormDialog } from "@/components/attendance/WorkLocationFormDialog";
import { Button } from "@/components/common/Button";
import { DropdownMenu } from "@/components/common/DropdownMenu";

type Props = {
  location: WorkLocation;
  // card: tombol Ubah melebar + ⋯ 44px (mobile)
  layout?: "row" | "card";
};

const MENU_ITEM =
  "flex min-h-11 w-full items-center gap-2.5 rounded-inner px-3 text-left text-sm font-bold text-danger-text transition-colors hover:bg-danger/8 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-accent/45";

// Ubah + menu ⋯ (Hapus) per lokasi (design settings-locations "LocationRow"). Dirender dua kali (tabel + card) — tanpa id statis.
export function WorkLocationActions({ location, layout = "row" }: Props) {
  const [dialog, setDialog] = useState<"edit" | "delete" | null>(null);
  const card = layout === "card";

  return (
    <>
      <div className={card ? "flex gap-2" : "flex justify-end gap-2"}>
        <Button variant="secondary" fullWidth={card} className={card ? "h-11" : "h-9 px-4 text-[13.5px]"} onClick={() => setDialog("edit")}>
          Ubah
        </Button>
        <DropdownMenu
          label={`Aksi lain untuk ${location.name}`}
          align="end"
          panelClassName="w-55"
          triggerClassName={`grid shrink-0 place-items-center rounded-full border border-border-control bg-control text-text-primary transition-colors hover:border-border-control-hover hover:bg-surface-solid ${card ? "size-11" : "size-9"}`}
          trigger={<MoreHorizontal aria-hidden className="size-4.5" />}
        >
          {(close) => (
            <button
              type="button"
              className={MENU_ITEM}
              onClick={() => {
                close();
                setDialog("delete");
              }}
            >
              <Trash2 aria-hidden className="size-4.5" />
              Hapus
            </button>
          )}
        </DropdownMenu>
      </div>
      {dialog === "edit" ? <WorkLocationFormDialog open onClose={() => setDialog(null)} location={location} /> : null}
      <DeleteWorkLocationDialog open={dialog === "delete"} onClose={() => setDialog(null)} location={location} />
    </>
  );
}

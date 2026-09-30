"use client";

import type { OrgKind } from "@exapay/shared";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";

import { DropdownMenu } from "@/components/common/DropdownMenu";
import { DeleteOrgItemDialog } from "@/components/organization/DeleteOrgItemDialog";
import { OrgItemFormDialog } from "@/components/organization/OrgItemFormDialog";

type Props = {
  kind: OrgKind;
  item: { id: string; name: string };
};

const ITEM =
  "flex min-h-11 w-full items-center gap-2.5 rounded-inner px-3 text-left text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-accent/45";

// Menu aksi per baris (ubah nama / hapus) — pola MemberActions
export function OrgItemActions({ kind, item }: Props) {
  const [dialog, setDialog] = useState<"rename" | "delete" | null>(null);

  return (
    <>
      <DropdownMenu
        label={`Aksi untuk ${item.name}`}
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
                setDialog("rename");
              }}
            >
              <Pencil aria-hidden className="size-4.5 text-text-secondary" />
              Ubah nama
            </button>
            <button
              type="button"
              className={`${ITEM} font-bold text-danger-text hover:bg-danger/8`}
              onClick={() => {
                close();
                setDialog("delete");
              }}
            >
              <Trash2 aria-hidden className="size-4.5" />
              Hapus
            </button>
          </>
        )}
      </DropdownMenu>
      <OrgItemFormDialog key={item.name} open={dialog === "rename"} onClose={() => setDialog(null)} kind={kind} item={item} />
      <DeleteOrgItemDialog open={dialog === "delete"} onClose={() => setDialog(null)} kind={kind} item={item} />
    </>
  );
}

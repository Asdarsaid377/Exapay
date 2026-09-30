"use client";

import { Copy, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { DropdownMenu } from "@/components/common/DropdownMenu";
import { DeleteKpiTemplateDialog } from "@/components/kpi/DeleteKpiTemplateDialog";

type Props = {
  template: { id: string; name: string; positionCount: number };
};

const ITEM =
  "flex min-h-11 w-full items-center gap-2.5 rounded-inner px-3 text-left text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-accent/45";

// Menu aksi per template (ubah / salin / hapus) — pola OrgItemActions
export function KpiTemplateActions({ template }: Props) {
  const [deleting, setDeleting] = useState(false);

  return (
    <>
      <DropdownMenu
        label={`Aksi untuk template ${template.name}`}
        align="end"
        panelClassName="w-52"
        triggerClassName="grid size-10 place-items-center rounded-field text-text-secondary transition-colors hover:bg-glass-hover hover:text-text-primary"
        trigger={<MoreHorizontal aria-hidden className="size-5" />}
      >
        {(close) => (
          <>
            <Link href={`/kpi/templates/${template.id}`} className={`${ITEM} text-text-primary hover:bg-accent/10`} onClick={close}>
              <Pencil aria-hidden className="size-4.5 text-text-secondary" />
              Ubah
            </Link>
            <Link href={`/kpi/templates/new?from=${template.id}`} className={`${ITEM} text-text-primary hover:bg-accent/10`} onClick={close}>
              <Copy aria-hidden className="size-4.5 text-text-secondary" />
              Salin jadi template baru
            </Link>
            <button
              type="button"
              className={`${ITEM} font-bold text-danger-text hover:bg-danger/8`}
              onClick={() => {
                close();
                setDeleting(true);
              }}
            >
              <Trash2 aria-hidden className="size-4.5" />
              Hapus
            </button>
          </>
        )}
      </DropdownMenu>
      <DeleteKpiTemplateDialog open={deleting} onClose={() => setDeleting(false)} template={template} />
    </>
  );
}

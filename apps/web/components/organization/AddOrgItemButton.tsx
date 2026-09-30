"use client";

import type { OrgKind } from "@exapay/shared";
import { Plus } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/common/Button";
import { OrgItemFormDialog } from "@/components/organization/OrgItemFormDialog";
import { ORG_LABELS } from "@/lib/organizationLabels";

type Props = {
  kind: OrgKind;
  // secondary di header card; primary sebagai CTA empty state
  variant?: "primary" | "secondary";
};

export function AddOrgItemButton({ kind, variant = "secondary" }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {/* Header card sempit (2 kolom): cukup "Tambah"; label aksesibel tetap lengkap */}
      <Button variant={variant} onClick={() => setOpen(true)} aria-label={`Tambah ${ORG_LABELS[kind].singular}`}>
        <Plus aria-hidden className="size-4.5" />
        {variant === "secondary" ? "Tambah" : `Tambah ${ORG_LABELS[kind].singular}`}
      </Button>
      <OrgItemFormDialog open={open} onClose={() => setOpen(false)} kind={kind} />
    </>
  );
}

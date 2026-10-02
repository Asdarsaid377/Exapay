"use client";

import { Plus } from "lucide-react";
import { useState } from "react";

import { WorkLocationFormDialog } from "@/components/attendance/WorkLocationFormDialog";
import { Button } from "@/components/common/Button";

type Props = {
  // lg + lebar penuh di mobile (aksi header); md di empty state
  size?: "md" | "lg";
  className?: string;
};

export function AddWorkLocationButton({ size = "md", className }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size={size} onClick={() => setOpen(true)} className={className}>
        <Plus aria-hidden className="size-4.5" />
        Tambah lokasi
      </Button>
      {/* Dipasang ulang tiap dibuka agar isian kembali kosong */}
      {open ? <WorkLocationFormDialog open onClose={() => setOpen(false)} /> : null}
    </>
  );
}

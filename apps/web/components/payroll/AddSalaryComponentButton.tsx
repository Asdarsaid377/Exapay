"use client";

import { Plus } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/common/Button";
import { SalaryComponentFormDialog } from "@/components/payroll/SalaryComponentFormDialog";

export function AddSalaryComponentButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)} aria-label="Tambah komponen gaji">
        <Plus aria-hidden className="size-4.5" />
        Tambah
      </Button>
      <SalaryComponentFormDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}

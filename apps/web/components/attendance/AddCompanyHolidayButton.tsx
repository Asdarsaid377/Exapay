"use client";

import { Plus } from "lucide-react";
import { useState } from "react";

import { CompanyHolidayFormDialog } from "@/components/attendance/CompanyHolidayFormDialog";
import { Button } from "@/components/common/Button";

type Props = {
  year: number;
  currentYear: number;
};

export function AddCompanyHolidayButton({ year, currentYear }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)} aria-label="Tambah libur usaha">
        <Plus aria-hidden className="size-4.5" />
        Tambah
      </Button>
      <CompanyHolidayFormDialog open={open} onClose={() => setOpen(false)} year={year} currentYear={currentYear} />
    </>
  );
}

"use client";

import type { EmployeeDetail, EmployeeFormOptions, EmployeeSalaryOverview } from "@exapay/shared";
import { ArrowLeft, Ellipsis, Pencil, UserX } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useState } from "react";

import { reactivateEmployee } from "@/actions/employees";
import { Badge } from "@/components/common/Badge";
import { Banner } from "@/components/common/Banner";
import { Button } from "@/components/common/Button";
import { DropdownMenu } from "@/components/common/DropdownMenu";
import { FormAlert } from "@/components/common/FormAlert";
import { DeactivateEmployeeDialog } from "@/components/employees/DeactivateEmployeeDialog";
import { EmployeeAvatar } from "@/components/employees/EmployeeAvatar";
import { EmployeeDataSections } from "@/components/employees/EmployeeDataSections";
import { EmployeeForm } from "@/components/employees/EmployeeForm";
import { EmployeeSalaryTab } from "@/components/payroll/EmployeeSalaryTab";
import { firstNameOf, formatIsoDate } from "@/lib/datetime";
import { EMPLOYEE_DETAIL_TABS, type EmployeeDetailTab, EMPLOYMENT_STATUS_LABELS, EMPLOYMENT_STATUS_TONES } from "@/lib/employeeLabels";

type Props = {
  employee: EmployeeDetail;
  // Hanya untuk owner/admin (mode ubah)
  options: EmployeeFormOptions | null;
  // Tab Gaji — hanya owner/admin (atasan tidak melihat tab ini)
  salary: { overview: EmployeeSalaryOverview | null; error: string | null } | null;
  // Tab aktif dari URL (?tab=) — tab KPI & Absensi punya navigasi bulan sendiri (feature 37b)
  tab: EmployeeDetailTab;
  // Isi tab KPI / Absensi dirender server (hanya tab aktif yang dimuat datanya)
  tabContent: ReactNode;
};

type Tab = EmployeeDetailTab;
const TAB_LABELS: Record<Tab, string> = { data: "Data", salary: "Gaji", kpi: "KPI", attendance: "Absensi" };
const FORM_ID = "employee-edit";

// Detail karyawan (design employees-detail): header + tab Data/Gaji/KPI/Absensi. Owner/admin: Ubah (form di tempat)
// dan Nonaktifkan / Aktifkan kembali. Atasan: hanya baca, tanpa data pajak & rekening, tanpa tab Gaji (feature 28).
// Tab berupa tautan ?tab= (feature 37b); tab Data tanpa parameter.
export function EmployeeDetailView({ employee, options, salary, tab, tabContent }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deactivateOpen, setDeactivateOpen] = useState(false);
  const [reactivating, setReactivating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inactive = !!employee.endDate;
  const canEdit = employee.canManage && options !== null;
  const firstName = firstNameOf(employee.fullName);
  const tabs = EMPLOYEE_DETAIL_TABS.filter((key) => key !== "salary" || salary !== null);

  async function handleReactivate() {
    setError(null);
    setReactivating(true);
    try {
      const outcome = await reactivateEmployee(employee.id);
      if (outcome.kind === "error") setError(outcome.message);
      else router.refresh();
    } catch {
      setError("Tidak dapat terhubung ke server. Periksa koneksi Anda lalu coba lagi.");
    } finally {
      setReactivating(false);
    }
  }

  const meta = [employee.position.name, employee.department.name, employee.employeeNumber].filter(Boolean).join(" · ");

  return (
    <>
      <div className="flex flex-col gap-3.5 px-1.5 pt-1">
        <Link
          href="/employees"
          className="inline-flex min-h-8 items-center gap-1.5 self-start text-sm font-bold text-accent-strong hover:text-accent-hover"
        >
          <ArrowLeft aria-hidden className="size-4" />
          {employee.canManage ? "Karyawan" : "Bawahan saya"}
        </Link>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-3.5 lg:gap-4.5">
            <EmployeeAvatar fullName={employee.fullName} size="lg" inactive={inactive} />
            <div className="flex min-w-0 flex-col gap-1.5">
              <h1
                className={`font-display text-[22px] leading-tight font-extrabold tracking-[-0.025em] lg:text-h1 ${inactive ? "text-text-secondary" : "text-text-primary"}`}
              >
                {editing ? `Ubah data ${employee.fullName}` : employee.fullName}
              </h1>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <span className="text-small text-text-secondary lg:text-[15px]">{meta}</span>
                <div className="flex gap-1.5">
                  <Badge tone={EMPLOYMENT_STATUS_TONES[employee.employmentStatus]}>{EMPLOYMENT_STATUS_LABELS[employee.employmentStatus]}</Badge>
                  {inactive ? <Badge tone="outline">Nonaktif</Badge> : <Badge tone="success">Aktif</Badge>}
                </div>
              </div>
            </div>
          </div>

          {canEdit && !editing && !inactive ? (
            <div className="flex gap-2">
              <Button variant="secondary" className="max-lg:h-11 max-lg:flex-1" onClick={() => setEditing(true)}>
                <Pencil aria-hidden className="size-4" />
                Ubah
              </Button>
              <DropdownMenu
                label="Aksi lain"
                align="end"
                panelClassName="w-65"
                triggerClassName="grid size-11 place-items-center rounded-full border border-border-control bg-control transition-colors hover:border-border-control-hover hover:bg-surface-solid lg:size-10"
                trigger={<Ellipsis aria-hidden className="size-4.5 text-text-primary" />}
              >
                {(close) => (
                  <button
                    type="button"
                    onClick={() => {
                      close();
                      setDeactivateOpen(true);
                    }}
                    className="flex h-11 items-center gap-2.5 rounded-inner px-3 text-left text-sm font-bold text-danger-text transition-colors hover:bg-danger-soft/80 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-accent/45"
                  >
                    <UserX aria-hidden className="size-4.25" />
                    Nonaktifkan karyawan
                  </button>
                )}
              </DropdownMenu>
            </div>
          ) : null}

          {editing ? (
            <div className="hidden gap-2 lg:flex">
              <Button variant="secondary" onClick={() => setEditing(false)} disabled={saving}>
                Batal
              </Button>
              <Button type="submit" form={FORM_ID} loading={saving}>
                {saving ? "Menyimpan…" : "Simpan perubahan"}
              </Button>
            </div>
          ) : null}
        </div>
      </div>

      {error ? <FormAlert tone="danger">{error}</FormAlert> : null}

      {inactive && employee.endDate ? (
        <Banner
          tone="neutral"
          icon={UserX}
          title={`Nonaktif sejak ${formatIsoDate(employee.endDate)}`}
          description={`Tidak ikut payroll berikutnya.${employee.endReason ? ` Alasan: ${employee.endReason}` : ""}`}
          action={
            canEdit ? (
              <Button variant="secondary" loading={reactivating} onClick={handleReactivate}>
                Aktifkan kembali
              </Button>
            ) : null
          }
        />
      ) : null}

      {editing && options ? (
        <EmployeeForm
          id={FORM_ID}
          options={options}
          employee={employee}
          onCancel={() => setEditing(false)}
          onSaved={() => setEditing(false)}
          onSubmittingChange={setSaving}
        />
      ) : (
        <>
          <div role="tablist" aria-label="Data karyawan" className="flex gap-5.5 overflow-x-auto border-b border-text-primary/10 px-1.5 lg:gap-7 lg:px-2">
            {tabs.map((key) => {
              const selected = key === tab;
              return (
                <Link
                  key={key}
                  href={key === "data" ? `/employees/${employee.id}` : `/employees/${employee.id}?tab=${key}`}
                  scroll={false}
                  role="tab"
                  id={`employee-tab-${key}`}
                  aria-selected={selected}
                  aria-controls="employee-tabpanel"
                  className={`inline-flex h-11 shrink-0 items-center px-0.5 text-[14.5px] transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-accent/45 lg:h-11.5 lg:text-[15px] ${
                    selected ? "font-bold text-text-primary shadow-[inset_0_-2px_0_var(--color-accent)]" : "font-medium text-text-secondary hover:text-text-primary"
                  }`}
                >
                  {TAB_LABELS[key]}
                </Link>
              );
            })}
          </div>
          <div id="employee-tabpanel" role="tabpanel" aria-labelledby={`employee-tab-${tab}`}>
            {tab === "data" ? (
              <EmployeeDataSections employee={employee} />
            ) : tab === "salary" && salary ? (
              <EmployeeSalaryTab employeeId={employee.id} firstName={firstName} overview={salary.overview} error={salary.error} />
            ) : (
              tabContent
            )}
          </div>
        </>
      )}

      {canEdit ? <DeactivateEmployeeDialog open={deactivateOpen} onClose={() => setDeactivateOpen(false)} employee={employee} /> : null}
    </>
  );
}

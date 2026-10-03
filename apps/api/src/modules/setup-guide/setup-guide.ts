import { SETUP_STEP_KEYS, type SetupGuide, type SetupStepKey } from "@exapay/shared";

// Status langkah panduan setup (feature 48) — fungsi murni dari fakta data usaha.

export type SetupFacts = {
  profileComplete: boolean;
  hasDepartment: boolean;
  hasPosition: boolean;
  // Jadwal kerja pernah diubah atau ditandai "sudah dicek" (jadwal bawaan dibuat otomatis saat daftar)
  scheduleReviewed: boolean;
  // Karyawan aktif urut nama: punya gaji berjalan? punya akun portal?
  activeEmployees: readonly { id: string; hasSalary: boolean; hasAccount: boolean }[];
  hasPayrollRun: boolean;
  hidden: boolean;
  closed: boolean;
};

export function setupGuideOf(facts: SetupFacts): SetupGuide {
  const active = facts.activeEmployees;
  const withSalary = active.filter((employee) => employee.hasSalary).length;
  const withAccount = active.filter((employee) => employee.hasAccount).length;
  const done: Record<SetupStepKey, boolean> = {
    company_profile: facts.profileComplete,
    organization: facts.hasDepartment && facts.hasPosition,
    work_schedule: facts.scheduleReviewed,
    employees: active.length > 0,
    salaries: active.length > 0 && withSalary === active.length,
    portal_accounts: withAccount > 0,
    first_payroll: facts.hasPayrollRun,
  };
  const steps = SETUP_STEP_KEYS.map((key) => ({
    key,
    done: done[key],
    progress:
      key === "salaries" && active.length > 0
        ? { done: withSalary, total: active.length }
        : key === "portal_accounts" && active.length > 0
          ? { done: withAccount, total: active.length }
          : null,
  }));
  const completedCount = steps.filter((step) => step.done).length;
  return {
    steps,
    completedCount,
    totalCount: steps.length,
    allDone: completedCount === steps.length,
    hidden: facts.hidden,
    closed: facts.closed,
    employeeWithoutSalaryId: active.find((employee) => !employee.hasSalary)?.id ?? null,
  };
}

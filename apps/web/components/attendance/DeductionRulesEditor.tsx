"use client";

import {
  type AttendanceDeductionPreview,
  attendanceDeductionPreviewInputSchema,
  type AttendanceDeductionRules,
  attendanceDeductionRulesSchema,
  type AttendanceDeductionSettings,
  isValidIsoDate,
  NO_ATTENDANCE_DEDUCTION_RULES,
} from "@exapay/shared";
import { type FormEvent, useState } from "react";

import { previewAttendanceDeduction, saveAttendanceDeductionRules } from "@/actions/attendanceDeductions";
import { DeductionPreviewResult } from "@/components/attendance/DeductionPreviewResult";
import { DeductionRuleFields } from "@/components/attendance/DeductionRuleFields";
import { Button } from "@/components/common/Button";
import { FormAlert } from "@/components/common/FormAlert";
import { FormSection } from "@/components/common/FormSection";
import { MoneyField } from "@/components/common/MoneyField";
import { SelectField } from "@/components/common/SelectField";
import { TextField } from "@/components/common/TextField";
import { type DraftErrors, draftErrorsFrom, draftFromRules, type RulesDraft, rulesInputFromDraft } from "@/lib/attendanceDeductionLabels";
import { formatIsoDate } from "@/lib/datetime";

type Props = {
  settings: AttendanceDeductionSettings;
  // Karyawan untuk pratinjau (masa kerja beririsan dengan bulan berjalan)
  employees: { id: string; fullName: string; positionName: string }[];
};

type Status = { tone: "success" | "danger"; message: string } | null;
type PreviewField = "employeeId" | "month" | "baseSalary" | "fixedAllowances" | "attendanceAllowance";

const NETWORK_ERROR = "Tidak dapat terhubung ke server. Periksa koneksi Anda lalu coba lagi.";

// Aturan potongan absensi (feature 17): form aturan → simpan sebagai versi baru dengan tanggal berlaku,
// dan pratinjau potongan satu karyawan memakai aturan di form (belum perlu disimpan). Perhitungan di API (payroll-engine).
export function DeductionRulesEditor({ settings, employees }: Props) {
  const latest = settings.versions[0];
  const [draft, setDraft] = useState<RulesDraft>(() => draftFromRules(latest?.rules ?? NO_ATTENDANCE_DEDUCTION_RULES));
  const [errors, setErrors] = useState<DraftErrors>({});
  const [effectiveFrom, setEffectiveFrom] = useState(settings.today);
  const [dateError, setDateError] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>(null);
  const [saving, setSaving] = useState(false);

  const [employeeId, setEmployeeId] = useState(employees[0]?.id ?? "");
  const [month, setMonth] = useState(settings.today.slice(0, 7));
  const [baseSalary, setBaseSalary] = useState("");
  const [fixedAllowances, setFixedAllowances] = useState("");
  const [attendanceAllowance, setAttendanceAllowance] = useState("");
  const [previewErrors, setPreviewErrors] = useState<Partial<Record<PreviewField, string>>>({});
  const [previewStatus, setPreviewStatus] = useState<string | null>(null);
  const [preview, setPreview] = useState<AttendanceDeductionPreview | null>(null);
  const [previewing, setPreviewing] = useState(false);

  // Versi terjadwal yang akan digantikan jika disimpan dengan tanggal ini
  const replaced = settings.versions.filter((version) => version.status === "scheduled" && version.effectiveFrom >= effectiveFrom);

  function updateDraft(patch: Partial<RulesDraft>) {
    setDraft((current) => ({ ...current, ...patch }));
    setErrors((current) => {
      const next = { ...current };
      // Object.keys kehilangan tipe kunci; patch hanya berisi kunci RulesDraft
      for (const key of Object.keys(patch)) delete next[key as keyof RulesDraft];
      // Aturan izin/sakit bergantung pada aturan alpa
      if ("absenceMode" in patch) delete next.permitSickMode;
      return next;
    });
    setStatus(null);
  }

  // Validasi aturan di form; kesalahan ditampilkan di isian masing-masing
  function parseRules(): AttendanceDeductionRules | null {
    const parsed = attendanceDeductionRulesSchema.safeParse(rulesInputFromDraft(draft));
    if (parsed.success) {
      setErrors({});
      return parsed.data;
    }
    setErrors(draftErrorsFrom(parsed.error.issues));
    return null;
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus(null);
    const rules = parseRules();
    const validDate = isValidIsoDate(effectiveFrom) && effectiveFrom >= settings.today;
    setDateError(validDate ? null : `Pilih tanggal mulai ${formatIsoDate(settings.today)} atau setelahnya`);
    if (!rules) {
      setStatus({ tone: "danger", message: "Periksa kembali isian aturan yang ditandai." });
      return;
    }
    if (!validDate) return;

    setSaving(true);
    try {
      const outcome = await saveAttendanceDeductionRules({ effectiveFrom, rules });
      if (outcome.kind === "error") {
        setStatus({ tone: "danger", message: outcome.message });
        return;
      }
      setStatus({ tone: "success", message: `Aturan disimpan. Berlaku mulai ${formatIsoDate(effectiveFrom)}; versi sebelumnya tetap tersimpan di riwayat.` });
    } catch {
      setStatus({ tone: "danger", message: NETWORK_ERROR });
    } finally {
      setSaving(false);
    }
  }

  async function handlePreview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPreviewStatus(null);
    const rules = parseRules();
    const parsed = attendanceDeductionPreviewInputSchema.safeParse({
      employeeId,
      month,
      baseSalary,
      fixedAllowances: fixedAllowances || "0",
      attendanceAllowance: attendanceAllowance || "0",
      rules: rules ?? NO_ATTENDANCE_DEDUCTION_RULES,
    });
    if (!parsed.success) {
      const next: Partial<Record<PreviewField, string>> = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if ((field === "employeeId" || field === "month" || field === "baseSalary" || field === "fixedAllowances" || field === "attendanceAllowance") && !next[field]) {
          next[field] = field === "baseSalary" && baseSalary === "" ? "Gaji pokok wajib diisi" : issue.message;
        }
      }
      setPreviewErrors(next);
    } else {
      setPreviewErrors({});
    }
    if (!rules) {
      setPreviewStatus("Perbaiki isian aturan yang ditandai di atas terlebih dahulu.");
      return;
    }
    if (!parsed.success) return;

    setPreviewing(true);
    try {
      const outcome = await previewAttendanceDeduction(parsed.data);
      if (outcome.kind === "error") {
        setPreviewStatus(outcome.message);
        return;
      }
      setPreview(outcome.preview);
    } catch {
      setPreviewStatus(NETWORK_ERROR);
    } finally {
      setPreviewing(false);
    }
  }

  return (
    <>
      <FormSection
        title="Aturan potongan absensi"
        description="Dipakai payroll untuk memotong gaji secara otomatis, lengkap dengan penjelasan di slip. Setiap penyimpanan menjadi versi baru dengan tanggal berlaku — versi lama tetap tersimpan."
      >
        <form noValidate onSubmit={handleSave} className="flex flex-col">
          <DeductionRuleFields draft={draft} errors={errors} onChange={updateDraft} disabled={saving} />

          <div className="flex flex-col gap-4 border-t border-border-subtle pt-5">
            <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2">
              <TextField
                id="deduction-effectiveFrom"
                label="Berlaku mulai"
                type="date"
                min={settings.today}
                value={effectiveFrom}
                onChange={(e) => {
                  setEffectiveFrom(e.target.value);
                  setDateError(null);
                  setStatus(null);
                }}
                error={dateError ?? undefined}
                hint="Versi yang sedang berjalan berakhir sehari sebelumnya."
                disabled={saving}
                className="tabular-nums"
              />
            </div>
            {replaced.length > 0 ? (
              <FormAlert tone="warning">
                Versi terjadwal mulai {replaced.map((version) => formatIsoDate(version.effectiveFrom)).join(", ")} belum pernah berlaku dan akan
                digantikan aturan ini.
              </FormAlert>
            ) : null}
            {status ? <FormAlert tone={status.tone}>{status.message}</FormAlert> : null}
            <div className="flex justify-end">
              <Button type="submit" loading={saving}>
                {saving ? "Menyimpan…" : "Simpan aturan"}
              </Button>
            </div>
          </div>
        </form>
      </FormSection>

      <FormSection
        title="Pratinjau potongan"
        description="Coba aturan di atas (belum perlu disimpan) pada absensi nyata satu karyawan. Gaji di sini hanya untuk pratinjau dan tidak disimpan — komponen gaji karyawan diatur terpisah."
      >
        <form noValidate onSubmit={handlePreview} className="flex flex-col gap-5">
          {employees.length === 0 ? (
            <p className="text-sm text-text-secondary">Belum ada karyawan aktif bulan ini untuk dijadikan contoh.</p>
          ) : (
            <>
              <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2">
                <SelectField
                  id="preview-employee"
                  label="Karyawan"
                  value={employeeId}
                  onChange={(e) => setEmployeeId(e.target.value)}
                  error={previewErrors.employeeId}
                  disabled={previewing}
                >
                  {employees.map((employee) => (
                    <option key={employee.id} value={employee.id}>
                      {employee.fullName} — {employee.positionName}
                    </option>
                  ))}
                </SelectField>
                <TextField
                  id="preview-month"
                  label="Bulan absensi"
                  type="month"
                  max={settings.today.slice(0, 7)}
                  value={month}
                  onChange={(e) => setMonth(e.target.value)}
                  error={previewErrors.month}
                  disabled={previewing}
                  className="tabular-nums"
                />
                <MoneyField
                  id="preview-baseSalary"
                  label="Gaji pokok"
                  requiredMark
                  value={baseSalary}
                  onChange={setBaseSalary}
                  error={previewErrors.baseSalary}
                  disabled={previewing}
                />
                <MoneyField
                  id="preview-fixedAllowances"
                  label="Total tunjangan tetap"
                  value={fixedAllowances}
                  onChange={setFixedAllowances}
                  error={previewErrors.fixedAllowances}
                  placeholder="0"
                  disabled={previewing}
                />
                <MoneyField
                  id="preview-attendanceAllowance"
                  label="Tunjangan kehadiran"
                  value={attendanceAllowance}
                  onChange={setAttendanceAllowance}
                  error={previewErrors.attendanceAllowance}
                  placeholder="0"
                  disabled={previewing}
                />
              </div>
              {previewStatus ? <FormAlert tone="danger">{previewStatus}</FormAlert> : null}
              <div className="flex justify-end">
                <Button type="submit" variant="secondary" loading={previewing}>
                  {previewing ? "Menghitung…" : "Hitung pratinjau"}
                </Button>
              </div>
              {preview ? <DeductionPreviewResult preview={preview} /> : null}
            </>
          )}
        </form>
      </FormSection>
    </>
  );
}

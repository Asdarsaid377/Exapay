"use client";

import { JKK_RISK_LEVELS, type JkkRiskLevel } from "@exapay/shared";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

import { saveJkkRiskLevel } from "@/actions/salary";
import { Button } from "@/components/common/Button";
import { FormAlert } from "@/components/common/FormAlert";
import { SelectField } from "@/components/common/SelectField";
import { JKK_RISK_LABELS } from "@/lib/salaryLabels";

type Props = {
  jkkRiskLevel: JkkRiskLevel;
};

// Kelompok risiko JKK usaha — menentukan tarif JKK semua karyawan yang ikut program JKK
export function JkkRiskLevelForm({ jkkRiskLevel }: Props) {
  const router = useRouter();
  const [level, setLevel] = useState<JkkRiskLevel>(jkkRiskLevel);
  const [status, setStatus] = useState<{ tone: "success" | "danger"; message: string } | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus(null);
    setSaving(true);
    try {
      const outcome = await saveJkkRiskLevel({ jkkRiskLevel: level });
      if (outcome.kind === "error") {
        setStatus({ tone: "danger", message: outcome.message });
        return;
      }
      setStatus({ tone: "success", message: "Kelompok risiko disimpan. Berlaku untuk payroll berikutnya." });
      router.refresh();
    } catch {
      setStatus({ tone: "danger", message: "Tidak dapat terhubung ke server. Periksa koneksi Anda lalu coba lagi." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-4">
      <SelectField
        id="jkk-risk-level"
        label="Kelompok risiko JKK"
        value={String(level)}
        onChange={(e) => {
          const next = JKK_RISK_LEVELS.find((candidate) => String(candidate) === e.target.value);
          if (next) setLevel(next);
          setStatus(null);
        }}
        disabled={saving}
        hint="Sesuai sertifikat kepesertaan BPJS Ketenagakerjaan usaha. Tarif tiap kelompok mengikuti PP 44/2015."
      >
        {JKK_RISK_LEVELS.map((option) => (
          <option key={option} value={option}>
            {JKK_RISK_LABELS[option]}
          </option>
        ))}
      </SelectField>
      {status ? <FormAlert tone={status.tone}>{status.message}</FormAlert> : null}
      <div className="flex justify-end border-t border-border-subtle pt-5">
        <Button type="submit" loading={saving} disabled={level === jkkRiskLevel}>
          {saving ? "Menyimpan…" : "Simpan"}
        </Button>
      </div>
    </form>
  );
}

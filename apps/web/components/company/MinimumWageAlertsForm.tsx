"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

import { saveMinimumWageAlerts } from "@/actions/company";
import { Button } from "@/components/common/Button";
import { Checkbox } from "@/components/common/Checkbox";
import { FormAlert } from "@/components/common/FormAlert";

type Props = {
  enabled: boolean;
  // Hanya owner yang boleh mengubah; admin melihat status saja
  canEdit: boolean;
};

// Sakelar peringatan gaji di bawah upah minimum (UMK/UMP). Bawaan mati — keputusan user 2026-10-02: tidak semua usaha
// wajib (usaha mikro & kecil dikecualikan), owner memilih sendiri. Pola JkkRiskLevelForm di FormSection.
export function MinimumWageAlertsForm({ enabled, canEdit }: Props) {
  const router = useRouter();
  const [checked, setChecked] = useState(enabled);
  const [status, setStatus] = useState<{ tone: "success" | "danger"; message: string } | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus(null);
    setSaving(true);
    try {
      const outcome = await saveMinimumWageAlerts(checked);
      if (outcome.kind === "error") {
        setStatus({ tone: "danger", message: outcome.message });
        return;
      }
      setStatus({ tone: "success", message: checked ? "Peringatan upah minimum dinyalakan." : "Peringatan upah minimum dimatikan." });
      router.refresh();
    } catch {
      setStatus({ tone: "danger", message: "Tidak dapat terhubung ke server. Periksa koneksi Anda lalu coba lagi." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-4">
      <label className={`flex min-h-11 items-start gap-3 ${canEdit ? "cursor-pointer" : ""}`}>
        <span className="flex h-6 items-center">
          <Checkbox
            checked={checked}
            onChange={(e) => {
              setChecked(e.target.checked);
              setStatus(null);
            }}
            disabled={!canEdit || saving}
          />
        </span>
        <span className="flex flex-col gap-1">
          <span className="text-[15px] font-bold text-text-primary">Tampilkan peringatan gaji di bawah upah minimum</span>
          <span className="text-small text-text-secondary text-pretty">
            Karyawan dengan gaji pokok + tunjangan tetap di bawah UMK/UMP kota usaha ditandai di dashboard, kalender kepatuhan, dan daftar karyawan.
          </span>
        </span>
      </label>
      {!canEdit ? <FormAlert tone="info">Hanya pemilik usaha yang bisa mengubah pengaturan ini.</FormAlert> : null}
      {status ? <FormAlert tone={status.tone}>{status.message}</FormAlert> : null}
      {canEdit ? (
        <div className="flex justify-end border-t border-border-subtle pt-5">
          <Button type="submit" loading={saving} disabled={checked === enabled}>
            {saving ? "Menyimpan…" : "Simpan"}
          </Button>
        </div>
      ) : null}
    </form>
  );
}

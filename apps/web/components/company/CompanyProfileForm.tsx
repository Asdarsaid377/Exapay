"use client";

import {
  type CompanyProfile,
  CUTOFF_DAY_MAX,
  CUTOFF_DAY_MIN,
  formatNpwp,
  PAYDAY_MAX,
  PAYDAY_MIN,
  paydayBeforeCutoff,
  type RegionProvince,
  type UpdateCompanyProfileInput,
  updateCompanyProfileSchema,
} from "@exapay/shared";
import { useRouter } from "next/navigation";
import { type FormEvent, type ReactNode, useState } from "react";

import { saveCompanyProfile } from "@/actions/company";
import { Button } from "@/components/common/Button";
import { FormAlert } from "@/components/common/FormAlert";
import { SelectField } from "@/components/common/SelectField";
import { TextAreaField } from "@/components/common/TextAreaField";
import { TextField } from "@/components/common/TextField";
import { formatDateTime } from "@/lib/datetime";

type Props = {
  profile: CompanyProfile;
  provinces: RegionProvince[];
};

// Nilai form (semua string — dikonversi saat simpan)
// attendanceCutoffDay "" = akhir bulan
type Values = { name: string; address: string; npwp: string; provinceCode: string; regencyCode: string; payday: string; attendanceCutoffDay: string };
type FieldErrors = Partial<Record<keyof UpdateCompanyProfileInput, string>>;

const FIELDS: readonly (keyof UpdateCompanyProfileInput)[] = ["name", "address", "npwp", "regencyCode", "payday", "attendanceCutoffDay"];
const PAYDAYS = Array.from({ length: PAYDAY_MAX - PAYDAY_MIN + 1 }, (_, i) => PAYDAY_MIN + i);
const CUTOFF_DAYS = Array.from({ length: CUTOFF_DAY_MAX - CUTOFF_DAY_MIN + 1 }, (_, i) => CUTOFF_DAY_MIN + i);

function valuesOf(profile: CompanyProfile): Values {
  return {
    name: profile.name,
    address: profile.address ?? "",
    npwp: profile.npwp ? formatNpwp(profile.npwp) : "",
    provinceCode: profile.regency?.provinceCode ?? "",
    regencyCode: profile.regency?.code ?? "",
    payday: profile.payday ? String(profile.payday) : "",
    attendanceCutoffDay: profile.attendanceCutoffDay ? String(profile.attendanceCutoffDay) : "",
  };
}

function inputOf(values: Values): UpdateCompanyProfileInput {
  return {
    name: values.name,
    address: values.address,
    npwp: values.npwp,
    regencyCode: values.regencyCode || null,
    payday: values.payday ? Number(values.payday) : null,
    attendanceCutoffDay: values.attendanceCutoffDay ? Number(values.attendanceCutoffDay) : null,
  };
}

function Section({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <section className="grid gap-5 border-t border-border-subtle py-6 first:border-t-0 first:pt-0 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:gap-8">
      <div className="flex flex-col gap-1">
        <h2 className="font-display text-h2 font-bold text-text-primary">{title}</h2>
        <p className="text-small text-text-secondary">{description}</p>
      </div>
      <div className="flex flex-col gap-4">{children}</div>
    </section>
  );
}

// Form profil usaha. Kota dipilih bertahap (provinsi → kabupaten/kota) dari data Kemendagri.
export function CompanyProfileForm({ profile, provinces }: Props) {
  const router = useRouter();
  const [values, setValues] = useState<Values>(() => valuesOf(profile));
  const [updatedAt, setUpdatedAt] = useState(profile.updatedAt);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [status, setStatus] = useState<{ tone: "success" | "danger"; message: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const regencies = provinces.find((p) => p.code === values.provinceCode)?.regencies ?? [];
  const payday = values.payday ? Number(values.payday) : null;
  const cutoffDay = values.attendanceCutoffDay ? Number(values.attendanceCutoffDay) : null;

  function update(field: keyof Values, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    setStatus(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus(null);

    const input = inputOf(values);
    const parsed = updateCompanyProfileSchema.safeParse(input);
    if (!parsed.success) {
      const errors: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const field = FIELDS.find((f) => f === issue.path[0]);
        if (field && !errors[field]) errors[field] = issue.message;
      }
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});

    setSubmitting(true);
    try {
      const outcome = await saveCompanyProfile(input);
      if (outcome.kind === "error") {
        setStatus({ tone: "danger", message: outcome.message });
        return;
      }
      setValues(valuesOf(outcome.profile));
      setUpdatedAt(outcome.profile.updatedAt);
      setStatus({ tone: "success", message: "Profil usaha disimpan." });
      // Nama usaha di header ikut diperbarui
      router.refresh();
    } catch {
      setStatus({ tone: "danger", message: "Tidak dapat terhubung ke server. Periksa koneksi Anda lalu coba lagi." });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form noValidate onSubmit={handleSubmit} className="glass-strong flex flex-col rounded-card p-5 lg:p-7">
      <Section title="Identitas usaha" description="Nama dan data pajak usaha Anda. Nama usaha tampil di header untuk semua pengguna.">
        <TextField
          id="company-name"
          label="Nama usaha"
          autoComplete="organization"
          value={values.name}
          onChange={(e) => update("name", e.target.value)}
          error={fieldErrors.name}
          disabled={submitting}
        />
        <TextField
          id="company-npwp"
          label="NPWP badan"
          inputMode="numeric"
          autoComplete="off"
          placeholder="00.000.000.0-000.000"
          value={values.npwp}
          onChange={(e) => update("npwp", e.target.value)}
          error={fieldErrors.npwp}
          hint="15 atau 16 digit. Boleh diketik dengan titik dan tanda hubung. Kosongkan jika belum punya."
          disabled={submitting}
        />
        <TextAreaField
          id="company-address"
          label="Alamat"
          autoComplete="street-address"
          placeholder="Nama jalan, nomor, kelurahan, kecamatan"
          value={values.address}
          onChange={(e) => update("address", e.target.value)}
          error={fieldErrors.address}
          disabled={submitting}
        />
      </Section>

      <Section
        title="Lokasi & penggajian"
        description="Kota/kabupaten menentukan UMK yang dipakai untuk memeriksa gaji pokok karyawan. Tanggal tutup buku menentukan rentang absensi yang dihitung di payroll tiap bulan."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            id="company-province"
            label="Provinsi"
            value={values.provinceCode}
            onChange={(e) => setValues((current) => ({ ...current, provinceCode: e.target.value, regencyCode: "" }))}
            disabled={submitting}
          >
            <option value="">Pilih provinsi</option>
            {provinces.map((province) => (
              <option key={province.code} value={province.code}>
                {province.name}
              </option>
            ))}
          </SelectField>
          <SelectField
            id="company-regency"
            label="Kota/kabupaten"
            value={values.regencyCode}
            onChange={(e) => update("regencyCode", e.target.value)}
            error={fieldErrors.regencyCode}
            disabled={submitting || !values.provinceCode}
          >
            <option value="">{values.provinceCode ? "Pilih kota/kabupaten" : "Pilih provinsi dulu"}</option>
            {regencies.map((regency) => (
              <option key={regency.code} value={regency.code}>
                {regency.name}
              </option>
            ))}
          </SelectField>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            id="company-payday"
            label="Tanggal gajian"
            value={values.payday}
            onChange={(e) => update("payday", e.target.value)}
            error={fieldErrors.payday}
            hint="Jika bulan itu lebih pendek, gajian jatuh di hari terakhir bulan."
            disabled={submitting}
          >
            <option value="">Belum ditentukan</option>
            {PAYDAYS.map((day) => (
              <option key={day} value={day}>
                Tanggal {day}
              </option>
            ))}
          </SelectField>
          <SelectField
            id="company-cutoff"
            label="Tutup buku absensi"
            value={values.attendanceCutoffDay}
            onChange={(e) => update("attendanceCutoffDay", e.target.value)}
            error={fieldErrors.attendanceCutoffDay}
            hint={
              cutoffDay === null
                ? "Absensi dihitung per bulan kalender."
                : `Gaji bulan ini menghitung absensi tanggal ${cutoffDay + 1} bulan lalu s.d. tanggal ${cutoffDay} bulan ini.`
            }
            disabled={submitting}
          >
            <option value="">Akhir bulan</option>
            {CUTOFF_DAYS.map((day) => (
              <option key={day} value={day}>
                Tanggal {day}
              </option>
            ))}
          </SelectField>
        </div>
        {paydayBeforeCutoff(payday, cutoffDay) ? (
          <FormAlert tone="warning">
            {`Gajian tanggal ${payday} jatuh sebelum absensi ditutup (${cutoffDay === null ? "akhir bulan" : `tanggal ${cutoffDay}`}) — payroll belum bisa difinalisasi di hari gajian. Pilih tanggal tutup buku sebelum tanggal gajian.`}
          </FormAlert>
        ) : null}
      </Section>

      <div className="flex flex-col gap-4 border-t border-border-subtle pt-6">
        {status ? <FormAlert tone={status.tone}>{status.message}</FormAlert> : null}
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-caption text-text-tertiary">Terakhir diubah {formatDateTime(updatedAt)}</p>
          <Button type="submit" loading={submitting}>
            {submitting ? "Menyimpan…" : "Simpan perubahan"}
          </Button>
        </div>
      </div>
    </form>
  );
}

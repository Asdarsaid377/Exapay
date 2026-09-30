"use client";

import {
  BANKS,
  type EmployeeDetail,
  type EmployeeFormInput,
  type EmployeeFormOptions,
  employeeInputSchema,
  EMPLOYMENT_STATUSES,
  type EmploymentStatus,
  GENDERS,
  type Gender,
  PTKP_STATUSES,
  type PtkpStatus,
} from "@exapay/shared";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

import { createEmployee, updateEmployee } from "@/actions/employees";
import { Banner } from "@/components/common/Banner";
import { Button, buttonClassName } from "@/components/common/Button";
import { Combobox } from "@/components/common/Combobox";
import { FormSection } from "@/components/common/FormSection";
import { SegmentedControl } from "@/components/common/SegmentedControl";
import { SelectField } from "@/components/common/SelectField";
import { TextField } from "@/components/common/TextField";
import { EMPLOYMENT_STATUS_LABELS, GENDER_LABELS } from "@/lib/employeeLabels";

type Props = {
  // <form id> — tombol di luar form (header detail) memakai atribut form={id}
  id: string;
  options: EmployeeFormOptions;
  // Tanpa employee = tambah; dengan employee = ubah
  employee?: EmployeeDetail;
  // Ubah: kembali ke tampilan baca. Tambah: tautan kembali ke daftar.
  onCancel?: () => void;
  onSaved?: () => void;
  onSubmittingChange?: (submitting: boolean) => void;
};

type Values = {
  fullName: string;
  employeeNumber: string;
  email: string;
  phone: string;
  birthDate: string;
  gender: Gender | "";
  departmentId: string;
  positionId: string;
  supervisorId: string;
  joinDate: string;
  employmentStatus: EmploymentStatus;
  contractEndDate: string;
  probationEndDate: string;
  nik: string;
  npwp: string;
  ptkpStatus: PtkpStatus | "";
  bankCode: string | null;
  bankAccountNumber: string;
  bankAccountHolder: string;
  userId: string;
};
type Field = keyof EmployeeFormInput;
type FieldErrors = Partial<Record<Field, string>>;

const STATUS_OPTIONS = EMPLOYMENT_STATUSES.map((value) => ({ value, label: EMPLOYMENT_STATUS_LABELS[value] }));
const BANK_OPTIONS = BANKS.map((bank) => ({ value: bank.code, label: bank.code, description: bank.name }));
const KEEP_HINT = "Kosongkan jika tidak diubah.";

function valuesOf(employee: EmployeeDetail | undefined): Values {
  return {
    fullName: employee?.fullName ?? "",
    employeeNumber: employee?.employeeNumber ?? "",
    email: employee?.email ?? "",
    phone: employee?.phone ?? "",
    birthDate: employee?.birthDate ?? "",
    gender: employee?.gender ?? "",
    departmentId: employee?.department.id ?? "",
    positionId: employee?.position.id ?? "",
    supervisorId: employee?.supervisor?.id ?? "",
    joinDate: employee?.joinDate ?? "",
    employmentStatus: employee?.employmentStatus ?? "permanent",
    contractEndDate: employee?.contractEndDate ?? "",
    probationEndDate: employee?.probationEndDate ?? "",
    // Nilai sensitif tidak pernah diisi ulang — kosong = tidak diubah
    nik: "",
    npwp: "",
    ptkpStatus: employee?.confidential?.ptkpStatus ?? "",
    bankCode: employee?.confidential?.bankCode ?? null,
    bankAccountNumber: "",
    bankAccountHolder: employee?.confidential?.bankAccountHolder ?? "",
    userId: employee?.userAccount?.id ?? "",
  };
}

// Nilai form → input schema (string kosong → null; schema yang menormalkan)
function inputOf(values: Values): EmployeeFormInput {
  return {
    fullName: values.fullName,
    employeeNumber: values.employeeNumber,
    email: values.email,
    phone: values.phone,
    birthDate: values.birthDate,
    gender: values.gender || null,
    departmentId: values.departmentId,
    positionId: values.positionId,
    supervisorId: values.supervisorId || null,
    joinDate: values.joinDate,
    employmentStatus: values.employmentStatus,
    contractEndDate: values.contractEndDate,
    probationEndDate: values.probationEndDate,
    nik: values.nik,
    npwp: values.npwp,
    // Pesan "Pilih status PTKP" datang dari schema (enum menolak string kosong)
    ptkpStatus: values.ptkpStatus as PtkpStatus,
    bankCode: (values.bankCode || null) as EmployeeFormInput["bankCode"],
    bankAccountNumber: values.bankAccountNumber,
    bankAccountHolder: values.bankAccountHolder,
    userId: values.userId || null,
  };
}

const GRID = "grid gap-x-4 gap-y-5 sm:grid-cols-2";

// Form tambah/ubah karyawan (design employees-new): 5 section kaca 2 kolom + bar aksi (mobile menempel di bawah).
export function EmployeeForm({ id, options, employee, onCancel, onSaved, onSubmittingChange }: Props) {
  const router = useRouter();
  const editing = !!employee;
  const [values, setValues] = useState<Values>(() => valuesOf(employee));
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<{ title: string; description: string; retry: boolean } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const confidential = employee?.confidential;
  // Akun yang sudah tertaut ke karyawan ini tetap bisa dipilih (daftar opsi hanya berisi akun yang belum tertaut)
  const users =
    employee?.userAccount && !options.users.some((u) => u.id === employee.userAccount?.id)
      ? [{ id: employee.userAccount.id, fullName: employee.fullName, email: employee.userAccount.email }, ...options.users]
      : options.users;

  function update<K extends keyof Values>(field: K, value: Values[K]) {
    setValues((current) => ({ ...current, [field]: value }));
    if (fieldErrors[field as Field]) setFieldErrors((current) => ({ ...current, [field]: undefined }));
  }

  function setSubmittingState(value: boolean) {
    setSubmitting(value);
    onSubmittingChange?.(value);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const input = inputOf(values);
    const parsed = employeeInputSchema.safeParse(input);
    if (!parsed.success) {
      const errors: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0] as Field | undefined;
        if (field && !errors[field]) errors[field] = issue.message;
      }
      setFieldErrors(errors);
      const count = Object.keys(errors).length;
      setFormError({ title: `${count} isian perlu diperbaiki`, description: "Periksa kolom bertanda merah di bawah, lalu simpan lagi.", retry: false });
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    setFieldErrors({});

    setSubmittingState(true);
    try {
      if (employee) {
        const outcome = await updateEmployee(employee.id, input);
        if (outcome.kind === "error") {
          setFormError({ title: "Gagal menyimpan", description: outcome.message, retry: false });
          return;
        }
        onSaved?.();
        router.refresh();
      } else {
        const outcome = await createEmployee(input);
        if (outcome.kind === "error") {
          setFormError({ title: "Gagal menyimpan", description: outcome.message, retry: false });
          return;
        }
        router.push(`/employees/${outcome.id}`);
      }
    } catch {
      setFormError({ title: "Gagal menyimpan — coba lagi", description: "Koneksi terputus saat menyimpan. Isian Anda masih ada di form ini.", retry: true });
    } finally {
      setSubmittingState(false);
    }
  }

  const cancel = onCancel ? (
    <Button variant="secondary" size="lg" className="lg:h-11" onClick={onCancel} disabled={submitting}>
      Batal
    </Button>
  ) : (
    <Link href="/employees" aria-disabled={submitting} className={buttonClassName({ variant: "secondary", size: "lg", className: `lg:h-11 ${submitting ? "pointer-events-none opacity-60" : ""}` })}>
      Batal
    </Link>
  );

  return (
    <form id={id} noValidate onSubmit={handleSubmit} className="flex flex-col gap-4 lg:gap-5">
      {formError ? (
        <Banner
          tone="danger"
          title={formError.title}
          description={formError.description}
          action={
            formError.retry ? (
              <Button type="submit" variant="secondary" loading={submitting}>
                Coba lagi
              </Button>
            ) : null
          }
        />
      ) : null}

      <FormSection title="Identitas" description="Data pribadi dasar. Email dipakai untuk mengirim undangan portal.">
        <div className={GRID}>
          <div className="sm:col-span-2">
            <TextField
              id={`${id}-name`}
              label="Nama lengkap"
            requiredMark
              autoComplete="off"
              placeholder="Sesuai KTP"
              value={values.fullName}
              onChange={(e) => update("fullName", e.target.value)}
              error={fieldErrors.fullName}
              disabled={submitting}
            />
          </div>
          <TextField
            id={`${id}-number`}
            label="Nomor induk karyawan"
            autoComplete="off"
            placeholder="mis. KN-0021"
            value={values.employeeNumber}
            onChange={(e) => update("employeeNumber", e.target.value)}
            error={fieldErrors.employeeNumber}
            hint="Opsional. Harus unik di usaha ini."
            disabled={submitting}
          />
          <TextField
            id={`${id}-email`}
            label="Email"
            type="email"
            autoComplete="off"
            placeholder="nama@contoh.com"
            value={values.email}
            onChange={(e) => update("email", e.target.value)}
            error={fieldErrors.email}
            hint="Opsional, untuk undangan portal."
            disabled={submitting}
          />
          <TextField
            id={`${id}-phone`}
            label="No. HP"
            type="tel"
            inputMode="tel"
            autoComplete="off"
            placeholder="08xx xxxx xxxx"
            value={values.phone}
            onChange={(e) => update("phone", e.target.value)}
            error={fieldErrors.phone}
            disabled={submitting}
          />
          <TextField
            id={`${id}-birth`}
            label="Tanggal lahir"
            type="date"
            value={values.birthDate}
            onChange={(e) => update("birthDate", e.target.value)}
            error={fieldErrors.birthDate}
            disabled={submitting}
          />
          <SelectField
            id={`${id}-gender`}
            label="Jenis kelamin"
            value={values.gender}
            onChange={(e) => update("gender", e.target.value as Gender | "")}
            error={fieldErrors.gender}
            disabled={submitting}
          >
            <option value="">Pilih</option>
            {GENDERS.map((gender) => (
              <option key={gender} value={gender}>
                {GENDER_LABELS[gender]}
              </option>
            ))}
          </SelectField>
        </div>
      </FormSection>

      <FormSection title="Pekerjaan" description="Menentukan posisi di struktur organisasi dan siapa yang menyetujui izin serta tugasnya.">
        <div className={GRID}>
          <SelectField
            id={`${id}-department`}
            label="Departemen"
            requiredMark
            value={values.departmentId}
            onChange={(e) => update("departmentId", e.target.value)}
            error={fieldErrors.departmentId}
            disabled={submitting}
          >
            <option value="">Pilih departemen</option>
            {options.departments.map((department) => (
              <option key={department.id} value={department.id}>
                {department.name}
              </option>
            ))}
          </SelectField>
          <SelectField
            id={`${id}-position`}
            label="Jabatan"
            requiredMark
            value={values.positionId}
            onChange={(e) => update("positionId", e.target.value)}
            error={fieldErrors.positionId}
            disabled={submitting}
          >
            <option value="">Pilih jabatan</option>
            {options.positions.map((position) => (
              <option key={position.id} value={position.id}>
                {position.name}
              </option>
            ))}
          </SelectField>
          <SelectField
            id={`${id}-supervisor`}
            label="Atasan langsung"
            value={values.supervisorId}
            onChange={(e) => update("supervisorId", e.target.value)}
            error={fieldErrors.supervisorId}
            hint="Opsional. Atasan bisa melihat data kerja bawahannya."
            disabled={submitting}
          >
            <option value="">Tanpa atasan</option>
            {options.supervisors.map((supervisor) => (
              <option key={supervisor.id} value={supervisor.id}>
                {supervisor.fullName} — {supervisor.positionName}
              </option>
            ))}
          </SelectField>
          <TextField
            id={`${id}-join`}
            label="Tanggal masuk"
            requiredMark
            type="date"
            value={values.joinDate}
            onChange={(e) => update("joinDate", e.target.value)}
            error={fieldErrors.joinDate}
            disabled={submitting}
          />
          <div className={`flex flex-col gap-1.5 ${values.employmentStatus === "permanent" ? "sm:col-span-2" : ""}`}>
            <span id={`${id}-status-label`} className="text-[13px] font-bold text-text-primary">
              Status kerja<span className="text-danger-text"> *</span>
            </span>
            <div className="max-sm:[&>div]:w-full">
              <SegmentedControl<EmploymentStatus>
                label="Status kerja"
                options={STATUS_OPTIONS}
                value={values.employmentStatus}
                onChange={(value) => update("employmentStatus", value)}
                disabled={submitting}
              />
            </div>
          </div>
          {values.employmentStatus === "contract" ? (
            <TextField
              id={`${id}-contract-end`}
              label="Tanggal akhir kontrak"
            requiredMark
              type="date"
              value={values.contractEndDate}
              onChange={(e) => update("contractEndDate", e.target.value)}
              error={fieldErrors.contractEndDate}
              hint="Pengingat muncul 30 hari sebelum kontrak habis."
              disabled={submitting}
            />
          ) : null}
          {values.employmentStatus === "probation" ? (
            <TextField
              id={`${id}-probation-end`}
              label="Tanggal akhir percobaan"
            requiredMark
              type="date"
              value={values.probationEndDate}
              onChange={(e) => update("probationEndDate", e.target.value)}
              error={fieldErrors.probationEndDate}
              hint="Masa percobaan paling lama 3 bulan."
              disabled={submitting}
            />
          ) : null}
        </div>
      </FormSection>

      <FormSection title="Pajak & identitas resmi" description="Dipakai untuk menghitung PPh 21 dan melapor BPJS." lockNote="Disimpan terenkripsi. Ditampilkan tersamar.">
        <div className={GRID}>
          <TextField
            id={`${id}-nik`}
            label="NIK"
            inputMode="numeric"
            autoComplete="off"
            placeholder={confidential?.nikMasked ?? "16 digit sesuai KTP"}
            value={values.nik}
            onChange={(e) => update("nik", e.target.value)}
            error={fieldErrors.nik}
            hint={editing && confidential?.nikMasked ? KEEP_HINT : undefined}
            disabled={submitting}
          />
          <TextField
            id={`${id}-npwp`}
            label="NPWP"
            inputMode="numeric"
            autoComplete="off"
            placeholder={confidential?.npwpMasked ?? "15 atau 16 digit"}
            value={values.npwp}
            onChange={(e) => update("npwp", e.target.value)}
            error={fieldErrors.npwp}
            hint={editing && confidential?.npwpMasked ? KEEP_HINT : "Opsional. NPWP 16 digit = NIK untuk WP orang pribadi."}
            disabled={submitting}
          />
          <SelectField
            id={`${id}-ptkp`}
            label="Status PTKP"
            requiredMark
            value={values.ptkpStatus}
            onChange={(e) => update("ptkpStatus", e.target.value as PtkpStatus | "")}
            error={fieldErrors.ptkpStatus}
            hint="TK = tidak kawin, K = kawin; angka = jumlah tanggungan."
            disabled={submitting}
          >
            <option value="">Pilih status PTKP</option>
            {PTKP_STATUSES.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </SelectField>
        </div>
      </FormSection>

      <FormSection title="Rekening bank" description="Tujuan transfer gaji setiap periode." lockNote="Disimpan terenkripsi. Ditampilkan tersamar.">
        <div className={GRID}>
          <Combobox
            id={`${id}-bank`}
            label="Nama bank"
            options={BANK_OPTIONS}
            value={values.bankCode}
            onChange={(value) => update("bankCode", value)}
            placeholder="Cari bank"
            error={fieldErrors.bankCode}
            disabled={submitting}
          />
          <TextField
            id={`${id}-account`}
            label="Nomor rekening"
            inputMode="numeric"
            autoComplete="off"
            placeholder={confidential?.bankAccountMasked ?? "Tanpa spasi atau titik"}
            value={values.bankAccountNumber}
            onChange={(e) => update("bankAccountNumber", e.target.value)}
            error={fieldErrors.bankAccountNumber}
            hint={editing && confidential?.bankAccountMasked ? KEEP_HINT : undefined}
            disabled={submitting}
          />
          <div className="sm:col-span-2">
            <TextField
              id={`${id}-holder`}
              label="Nama pemilik rekening"
              autoComplete="off"
              placeholder="Sesuai buku tabungan"
              value={values.bankAccountHolder}
              onChange={(e) => update("bankAccountHolder", e.target.value)}
              error={fieldErrors.bankAccountHolder}
              disabled={submitting}
            />
          </div>
        </div>
      </FormSection>

      <FormSection title="Akun portal" description="Opsional. Karyawan bisa masuk ke portal untuk absen & mencatat tugas.">
        <SelectField
          id={`${id}-user`}
          label="Tautkan ke akun pengguna"
          value={values.userId}
          onChange={(e) => update("userId", e.target.value)}
          error={fieldErrors.userId}
          hint={
            <>
              Hanya anggota usaha yang belum tertaut. Belum terdaftar?{" "}
              <Link href="/settings/users" className="font-bold text-accent-strong hover:text-accent-hover">
                Undang lewat menu Pengguna
              </Link>
            </>
          }
          disabled={submitting}
        >
          <option value="">{users.length ? "Pilih anggota usaha" : "Belum ada anggota yang bisa ditautkan"}</option>
          {users.map((user) => (
            <option key={user.id} value={user.id}>
              {user.fullName} · {user.email}
            </option>
          ))}
        </SelectField>
      </FormSection>

      <div className="glass-data sticky bottom-2.5 z-10 flex flex-col gap-3 rounded-[26px] p-2.5 lg:static lg:flex-row lg:items-center lg:justify-between lg:rounded-card lg:py-3 lg:pr-3 lg:pl-5.5">
        <p className="hidden text-small text-text-secondary lg:block">
          {editing ? "Perubahan tercatat di log audit." : "Setelah disimpan, karyawan langsung masuk hitungan payroll periode berjalan."}
        </p>
        <div className="grid grid-cols-[1fr_1.6fr] gap-2 lg:flex lg:gap-2.5">
          {cancel}
          <Button type="submit" size="lg" className="lg:h-11 lg:min-w-33" loading={submitting}>
            {submitting ? "Menyimpan…" : editing ? "Simpan perubahan" : "Simpan"}
          </Button>
        </div>
      </div>
    </form>
  );
}

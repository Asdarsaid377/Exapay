"use client";

import { bankName, type EmployeeDetail, formatBankAccount, formatNik, formatNpwp, type RevealedSensitive, type SensitiveSection } from "@exapay/shared";
import { Eye, EyeOff } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { revealSensitive } from "@/actions/employees";
import { Badge } from "@/components/common/Badge";
import { Button } from "@/components/common/Button";
import { FormAlert } from "@/components/common/FormAlert";
import { FormSection } from "@/components/common/FormSection";
import { ReadFields } from "@/components/common/ReadFields";
import { formatDateTime, formatIsoDate, formatTenure, todayIso } from "@/lib/datetime";
import { EMPLOYMENT_STATUS_LABELS, EMPLOYMENT_STATUS_TONES, GENDER_LABELS, PTKP_LABELS } from "@/lib/employeeLabels";

type Props = {
  employee: EmployeeDetail;
};

const EMPTY = "—";

function RevealControl({
  open,
  loading,
  revealed,
  onToggle,
}: {
  open: boolean;
  loading: boolean;
  revealed: RevealedSensitive | undefined;
  onToggle: () => void;
}) {
  return (
    <>
      <Button variant="secondary" className="h-9 px-3.5 text-[13px]" loading={loading} onClick={onToggle} aria-pressed={open}>
        {loading ? null : open ? <EyeOff aria-hidden className="size-4" /> : <Eye aria-hidden className="size-4" />}
        {open ? "Sembunyikan" : "Tampilkan"}
      </Button>
      {open && revealed ? (
        <p className="hidden text-caption text-text-tertiary lg:block">
          Tercatat di log audit · {revealed.revealedBy}, {formatDateTime(revealed.revealedAt)}
        </p>
      ) : null}
    </>
  );
}

// Tab Data detail karyawan: section baca per kelompok. Data pajak & rekening tersamar; "Tampilkan" mengambil nilai penuh
// dari API (tercatat di audit log) dan hanya disimpan di state halaman ini. Atasan tidak menerima section sensitif.
export function EmployeeDataSections({ employee }: Props) {
  const [revealed, setRevealed] = useState<Partial<Record<SensitiveSection, RevealedSensitive>>>({});
  const [open, setOpen] = useState<Partial<Record<SensitiveSection, boolean>>>({});
  const [loading, setLoading] = useState<SensitiveSection | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function toggle(section: SensitiveSection) {
    setError(null);
    if (open[section]) {
      setOpen((current) => ({ ...current, [section]: false }));
      return;
    }
    // Setiap kali dibuka = satu catatan audit; nilai lama tidak dipakai ulang
    setLoading(section);
    try {
      const outcome = await revealSensitive(employee.id, section);
      if (outcome.kind === "error") {
        setError(outcome.message);
        return;
      }
      setRevealed((current) => ({ ...current, [section]: outcome.revealed }));
      setOpen((current) => ({ ...current, [section]: true }));
    } catch {
      setError("Tidak dapat terhubung ke server. Periksa koneksi Anda lalu coba lagi.");
    } finally {
      setLoading(null);
    }
  }

  const today = todayIso();
  const statusSub =
    employee.employmentStatus === "contract" && employee.contractEndDate
      ? `Berakhir ${formatIsoDate(employee.contractEndDate)}`
      : employee.employmentStatus === "probation" && employee.probationEndDate
        ? `Selesai ${formatIsoDate(employee.probationEndDate)}`
        : "Tanpa tanggal akhir";

  const c = employee.confidential;
  const tax = revealed.tax?.section === "tax" && open.tax ? revealed.tax : null;
  const bank = revealed.bank?.section === "bank" && open.bank ? revealed.bank : null;

  return (
    <div className="flex flex-col gap-4 lg:gap-5">
      {error ? <FormAlert tone="danger">{error}</FormAlert> : null}

      <FormSection title="Identitas">
        <ReadFields
          fields={[
            { label: "Nama lengkap", value: employee.fullName },
            { label: "Nomor induk karyawan", value: employee.employeeNumber ?? EMPTY },
            { label: "Email", value: employee.email ?? EMPTY },
            { label: "No. HP", value: employee.phone ? employee.phone.replace(/(\d{4})(?=\d)/g, "$1 ") : EMPTY },
            { label: "Tanggal lahir", value: employee.birthDate ? formatIsoDate(employee.birthDate) : EMPTY },
            { label: "Jenis kelamin", value: employee.gender ? GENDER_LABELS[employee.gender] : EMPTY },
          ]}
        />
      </FormSection>

      <FormSection title="Pekerjaan">
        <ReadFields
          fields={[
            { label: "Departemen", value: employee.department.name },
            { label: "Jabatan", value: employee.position.name },
            {
              label: "Atasan langsung",
              value: employee.supervisor ? (
                employee.canManage ? (
                  <Link href={`/employees/${employee.supervisor.id}`} className="font-bold text-accent-strong hover:text-accent-hover">
                    {employee.supervisor.fullName}
                  </Link>
                ) : (
                  employee.supervisor.fullName
                )
              ) : (
                EMPTY
              ),
            },
            { label: "Tanggal masuk", value: formatIsoDate(employee.joinDate) },
            { label: "Masa kerja", value: formatTenure(employee.joinDate, employee.endDate ?? today) },
            {
              label: "Status kerja",
              value: (
                <>
                  <Badge tone={EMPLOYMENT_STATUS_TONES[employee.employmentStatus]}>{EMPLOYMENT_STATUS_LABELS[employee.employmentStatus]}</Badge>
                  <span className="text-sm font-normal text-text-secondary">{statusSub}</span>
                </>
              ),
            },
          ]}
        />
      </FormSection>

      {c ? (
        <FormSection
          title="Pajak & identitas resmi"
          lockNote="Disimpan terenkripsi"
          aside={
            c.nikMasked || c.npwpMasked ? (
              <RevealControl open={!!open.tax} loading={loading === "tax"} revealed={revealed.tax} onToggle={() => toggle("tax")} />
            ) : null
          }
        >
          <ReadFields
            fields={[
              { label: "NIK", value: tax ? (tax.nik ? formatNik(tax.nik) : EMPTY) : (c.nikMasked ?? EMPTY), masked: true },
              { label: "NPWP", value: tax ? (tax.npwp ? formatNpwp(tax.npwp) : EMPTY) : (c.npwpMasked ?? EMPTY), masked: true },
              { label: "Status PTKP", value: `${c.ptkpStatus} · ${PTKP_LABELS[c.ptkpStatus]}`, wide: true },
            ]}
          />
        </FormSection>
      ) : null}

      {c ? (
        <FormSection
          title="Rekening bank"
          lockNote="Disimpan terenkripsi"
          aside={
            c.bankAccountMasked ? (
              <RevealControl open={!!open.bank} loading={loading === "bank"} revealed={revealed.bank} onToggle={() => toggle("bank")} />
            ) : null
          }
        >
          <ReadFields
            fields={[
              { label: "Nama bank", value: c.bankCode ? <span title={bankName(c.bankCode)}>{c.bankCode}</span> : EMPTY },
              {
                label: "Nomor rekening",
                value: bank ? (bank.bankAccountNumber ? formatBankAccount(bank.bankAccountNumber) : EMPTY) : (c.bankAccountMasked ?? EMPTY),
                masked: true,
              },
              { label: "Nama pemilik rekening", value: c.bankAccountHolder ?? EMPTY, wide: true },
            ]}
          />
        </FormSection>
      ) : null}

      <FormSection title="Akun portal">
        <ReadFields
          fields={[
            {
              label: "Status",
              value: employee.userAccount ? `Tertaut: ${employee.userAccount.email}` : "Belum tertaut",
              wide: true,
            },
          ]}
        />
      </FormSection>
    </div>
  );
}

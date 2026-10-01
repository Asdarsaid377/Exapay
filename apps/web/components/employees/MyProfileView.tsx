import { bankName, type MyEmployeeProfile } from "@exapay/shared";
import { Lock } from "lucide-react";
import type { ReactNode } from "react";

import { Badge } from "@/components/common/Badge";
import { ReadFields } from "@/components/common/ReadFields";
import { EmployeeAvatar } from "@/components/employees/EmployeeAvatar";
import { formatIsoDate, formatTenure } from "@/lib/datetime";
import { EMPLOYMENT_STATUS_LABELS, EMPLOYMENT_STATUS_TONES, GENDER_LABELS, PTKP_LABELS } from "@/lib/employeeLabels";

type Props = {
  employee: MyEmployeeProfile;
  inactive: boolean;
  // Tanggal hari ini (zona waktu usaha) untuk masa kerja
  today: string;
};

const EMPTY = "—";

// Card solid per kelompok data (portal maks. 3 lapisan blur) — pola section /me/performance
function ProfileSection({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="surface-solid flex flex-col gap-4 rounded-card p-4.5">
      <div className="flex flex-col gap-1">
        <h2 className="font-display text-[17px] font-bold tracking-[-0.01em] text-text-primary">{title}</h2>
        {note ? (
          <p className="flex items-center gap-2 text-[13px] text-text-secondary">
            <Lock aria-hidden className="size-3.75 shrink-0" />
            {note}
          </p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

// Profil milik sendiri di /me/profile (feature 37) — hanya baca. Tanpa referensi desain halaman ini: pola me.html (card
// solid) + section baca detail karyawan (EmployeeDataSections), izin user. Data pajak & rekening tersamar tanpa "Tampilkan".
export function MyProfileView({ employee, inactive, today }: Props) {
  const c = employee.confidential;
  const statusSub =
    employee.employmentStatus === "contract" && employee.contractEndDate
      ? `Berakhir ${formatIsoDate(employee.contractEndDate)}`
      : employee.employmentStatus === "probation" && employee.probationEndDate
        ? `Selesai ${formatIsoDate(employee.probationEndDate)}`
        : null;

  return (
    <>
      <section aria-label="Identitas" className="surface-solid flex items-center gap-3.5 rounded-card p-4.5">
        <EmployeeAvatar fullName={employee.fullName} size="lg" inactive={inactive} />
        <div className="flex min-w-0 flex-col gap-1">
          <p className="truncate font-display text-[19px] font-extrabold tracking-[-0.01em] text-text-primary">{employee.fullName}</p>
          <p className="truncate text-sm text-text-secondary">
            {employee.position.name} · {employee.department.name}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {inactive ? <Badge tone="neutral">Nonaktif</Badge> : <Badge tone={EMPLOYMENT_STATUS_TONES[employee.employmentStatus]}>{EMPLOYMENT_STATUS_LABELS[employee.employmentStatus]}</Badge>}
            {employee.employeeNumber ? <span className="text-[13px] text-text-tertiary tabular-nums">No. induk {employee.employeeNumber}</span> : null}
          </div>
        </div>
      </section>

      <ProfileSection title="Pekerjaan">
        <ReadFields
          fields={[
            { label: "Atasan langsung", value: employee.supervisor?.fullName ?? EMPTY },
            { label: "Tanggal masuk", value: formatIsoDate(employee.joinDate) },
            { label: "Masa kerja", value: formatTenure(employee.joinDate, employee.endDate ?? today) },
            {
              label: "Status kerja",
              value: (
                <>
                  {EMPLOYMENT_STATUS_LABELS[employee.employmentStatus]}
                  {statusSub ? <span className="text-sm font-normal text-text-secondary">{statusSub}</span> : null}
                </>
              ),
            },
            ...(employee.endDate ? [{ label: "Tanggal keluar", value: formatIsoDate(employee.endDate), wide: true }] : []),
          ]}
        />
      </ProfileSection>

      <ProfileSection title="Data pribadi">
        <ReadFields
          fields={[
            { label: "Email", value: employee.email ?? EMPTY },
            { label: "No. HP", value: employee.phone ? employee.phone.replace(/(\d{4})(?=\d)/g, "$1 ") : EMPTY },
            { label: "Tanggal lahir", value: employee.birthDate ? formatIsoDate(employee.birthDate) : EMPTY },
            { label: "Jenis kelamin", value: employee.gender ? GENDER_LABELS[employee.gender] : EMPTY },
          ]}
        />
      </ProfileSection>

      <ProfileSection title="Pajak & rekening" note="Disimpan terenkripsi · ditampilkan tersamar">
        <ReadFields
          fields={[
            { label: "NIK", value: c.nikMasked ?? EMPTY, masked: true },
            { label: "NPWP", value: c.npwpMasked ?? EMPTY, masked: true },
            { label: "Status PTKP", value: `${c.ptkpStatus} · ${PTKP_LABELS[c.ptkpStatus]}`, wide: true },
            { label: "Bank", value: c.bankCode ? bankName(c.bankCode) : EMPTY },
            { label: "Nomor rekening", value: c.bankAccountMasked ?? EMPTY, masked: true },
            { label: "Nama pemilik rekening", value: c.bankAccountHolder ?? EMPTY, wide: true },
          ]}
        />
      </ProfileSection>
    </>
  );
}

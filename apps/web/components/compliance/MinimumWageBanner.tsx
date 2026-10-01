import { formatRupiah, type MinimumWageEmployee, minimumWageLabel, type MinimumWageReference, type MinimumWageSummary } from "@exapay/shared";
import { MapPin } from "lucide-react";
import Link from "next/link";

import { Banner } from "@/components/common/Banner";
import { buttonClassName } from "@/components/common/Button";
import { formatIsoDate } from "@/lib/datetime";
import { minimumWageReferenceOf } from "@/lib/employeeLabels";

type Props = {
  summary: MinimumWageSummary;
};

const LINK = "font-bold text-accent-strong hover:text-accent-hover";

function EmployeeLinks({ items }: { items: MinimumWageEmployee[] }) {
  return (
    <ul className="mt-1.5 flex flex-col gap-1">
      {items.map(({ employee, flag }) => (
        <li key={employee.id}>
          <Link href={`/employees/${employee.id}`} className={LINK}>
            {employee.fullName}
          </Link>{" "}
          <span className="tabular-nums">— upah {formatRupiah(flag.wage)}</span>
        </li>
      ))}
    </ul>
  );
}

function referenceText(reference: MinimumWageReference | null): string {
  return reference ? `${minimumWageLabel(reference)} (${formatRupiah(reference.monthlyAmount)}/bulan)` : "upah minimum";
}

// Peringatan upah minimum (feature 34) di atas kalender kepatuhan — pola banner "di bawah UMK" dashboard.html
// lewat Banner (design-tokens "banner"). Upah = gaji pokok + tunjangan tetap. Bukan pengingat bertanggal: hilang sendiri
// setelah gaji disesuaikan. Tidak tampil apa-apa bila semua karyawan aktif sesuai.
export function MinimumWageBanner({ summary }: Props) {
  if (!summary.locationSet) {
    return (
      <Banner
        tone="neutral"
        icon={MapPin}
        title="Upah minimum belum bisa dicek"
        description="Atur kota/kabupaten lokasi usaha agar gaji karyawan dibandingkan dengan UMK (atau UMP provinsi) yang berlaku."
        action={
          <Link href="/settings/company" className={buttonClassName({ variant: "secondary" })}>
            Atur lokasi usaha
          </Link>
        }
      />
    );
  }

  if (summary.current === null && summary.upcoming === null) {
    return (
      <Banner
        tone="neutral"
        icon={MapPin}
        title="Data upah minimum belum tersedia"
        description="UMK/UMP yang berlaku hari ini untuk lokasi usaha belum ada di data regulasi Exapay, jadi gaji karyawan belum dibandingkan. Hubungi dukungan Exapay."
      />
    );
  }

  const below = summary.employees.filter((item) => item.flag.status === "below");
  const upcoming = summary.employees.filter((item) => item.flag.status === "below_upcoming");
  // Semua tanda "below" memakai pembanding yang sama kecuali karyawan yang baru akan masuk setelah versi berikutnya berlaku
  const belowReference = below[0] ? minimumWageReferenceOf(below[0].flag, summary.current, summary.upcoming) : summary.current;

  return (
    <>
      {below.length > 0 ? (
        <Banner
          tone="warning"
          title={`${below.length} karyawan bergaji di bawah ${belowReference ? minimumWageLabel(belowReference) : "upah minimum"}`}
          description={
            <>
              Upah (gaji pokok + tunjangan tetap) kurang dari {referenceText(belowReference)}. Payroll tetap bisa diproses — sesuaikan gaji sebelum finalisasi agar
              sesuai ketentuan.
              <EmployeeLinks items={below} />
            </>
          }
        />
      ) : null}
      {upcoming.length > 0 && summary.upcoming ? (
        <Banner
          tone="warning"
          title={`${upcoming.length} karyawan akan di bawah ${minimumWageLabel(summary.upcoming)} mulai ${formatIsoDate(summary.upcoming.effectiveFrom)}`}
          description={
            <>
              {referenceText(summary.upcoming)} sudah ditetapkan. Jadwalkan gaji baru yang berlaku mulai tanggal itu di tab Gaji karyawan.
              <EmployeeLinks items={upcoming} />
            </>
          }
        />
      ) : null}
    </>
  );
}

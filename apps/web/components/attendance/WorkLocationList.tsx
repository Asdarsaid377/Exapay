import type { WorkLocationOverview } from "@exapay/shared";
import { Info } from "lucide-react";
import Link from "next/link";

import { WorkLocationActions } from "@/components/attendance/WorkLocationActions";
import { formatCoordinates } from "@/lib/workLocationLabels";

type Props = {
  overview: WorkLocationOverview;
};

const HEAD = "px-4 text-left text-caption font-bold whitespace-nowrap text-text-secondary first:pl-5 last:pr-5";
const CELL = "px-4 py-3 first:pl-5 last:pr-5";

// "16 karyawan dicek di semua lokasi · 1 hanya Gudang Roasting · 2 dikecualikan" — karyawan aktif per mode lokasi
function employeeSummary({ items, employees }: WorkLocationOverview): string {
  const parts = [`${employees.all} karyawan dicek di semua lokasi`];
  if (employees.selected > 0) {
    const used = items.filter((item) => item.selectedEmployeeCount > 0);
    const total = used.reduce((sum, item) => sum + item.selectedEmployeeCount, 0);
    // Tiap karyawan memilih tepat satu lokasi → rinci per lokasi; selain itu cukup jumlahnya
    if (total === employees.selected) parts.push(...used.map((item) => `${item.selectedEmployeeCount} hanya ${item.name}`));
    else parts.push(`${employees.selected} di lokasi tertentu`);
  }
  if (employees.exempt > 0) parts.push(`${employees.exempt} dikecualikan`);
  return parts.join(" · ");
}

// Daftar lokasi kerja (design settings-locations): tabel kaca di desktop, card per lokasi di mobile, ringkasan karyawan,
// dan tips. Tanpa ikon pin/peta — koordinat & radius sebagai angka tabular.
export function WorkLocationList({ overview }: Props) {
  return (
    <>
      <section className="hidden rounded-card glass-data lg:block">
        <table className="w-full table-fixed">
          <thead>
            <tr className="h-11 border-b border-border-subtle bg-table-head">
              <th scope="col" className={`${HEAD} rounded-tl-card`}>
                Lokasi
              </th>
              <th scope="col" className={`${HEAD} w-[30%]`}>
                Koordinat
              </th>
              <th scope="col" className={`${HEAD} w-30`}>
                Radius
              </th>
              <th scope="col" className={`${HEAD} w-40 rounded-tr-card`}>
                <span className="sr-only">Aksi</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {overview.items.map((location) => (
              <tr key={location.id} className="h-19 border-t border-border-subtle/90 text-text-primary first:border-t-0">
                <td className={CELL}>
                  <div className="flex min-w-0 flex-col gap-0.75">
                    <span className="truncate text-[15px] font-bold">{location.name}</span>
                    {location.address ? <span className="truncate text-[13.5px] text-text-secondary">{location.address}</span> : null}
                  </div>
                </td>
                <td className={`${CELL} text-[14.5px] font-medium tabular-nums`}>{formatCoordinates(location.latitude, location.longitude)}</td>
                <td className={`${CELL} text-[14.5px] font-medium tabular-nums`}>{location.radiusM.toLocaleString("id-ID")} m</td>
                <td className={CELL}>
                  <WorkLocationActions location={location} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <ul className="flex flex-col gap-3 lg:hidden">
        {overview.items.map((location) => (
          <li key={location.id} className="glass-data flex flex-col gap-3 rounded-card px-4.5 py-4 text-text-primary">
            <div className="flex min-w-0 flex-col gap-0.75">
              <span className="font-display text-base font-bold break-words">{location.name}</span>
              {location.address ? <span className="text-[13.5px] break-words text-text-secondary">{location.address}</span> : null}
            </div>
            <dl className="grid grid-cols-[minmax(0,1fr)_80px] gap-3 border-y border-border-subtle/90 py-2.5">
              <div className="flex flex-col gap-0.5">
                <dt className="text-caption text-text-tertiary">Koordinat</dt>
                <dd className="text-[14.5px] font-medium tabular-nums">{formatCoordinates(location.latitude, location.longitude)}</dd>
              </div>
              <div className="flex flex-col gap-0.5">
                <dt className="text-caption text-text-tertiary">Radius</dt>
                <dd className="text-[14.5px] font-medium tabular-nums">{location.radiusM.toLocaleString("id-ID")} m</dd>
              </div>
            </dl>
            <WorkLocationActions location={location} layout="card" />
          </li>
        ))}
      </ul>

      <div className="flex flex-col gap-1 px-1.5 text-[13.5px] text-text-secondary sm:flex-row sm:items-center sm:justify-between sm:gap-4 lg:px-2 lg:text-sm">
        <span className="tabular-nums">{employeeSummary(overview)}</span>
        <Link href="/employees" className="font-bold text-accent-strong hover:text-accent-hover hover:underline">
          Lihat daftar karyawan
        </Link>
      </div>

      <div role="note" className="flex gap-3 rounded-[18px] border border-info/22 bg-surface-solid/92 px-4 py-3.5 lg:px-4.5">
        <Info aria-hidden className="mt-px size-4.5 shrink-0 text-info" />
        <p className="text-[13.5px] text-pretty text-neutral-text lg:text-sm">
          Tips: tekan “Pakai lokasi saya sekarang” saat Anda berada di tempat usaha. Radius 100 m cocok untuk satu bangunan; besarkan jika sinyal GPS di
          lokasi sering meleset.
        </p>
      </div>
    </>
  );
}

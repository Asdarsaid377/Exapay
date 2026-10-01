import type { SalaryComponent } from "@exapay/shared";

import { Badge } from "@/components/common/Badge";
import { AddSalaryComponentButton } from "@/components/payroll/AddSalaryComponentButton";
import { SalaryComponentActions } from "@/components/payroll/SalaryComponentActions";
import { COMPONENT_KIND_LABELS } from "@/lib/salaryLabels";

type Props = {
  components: SalaryComponent[];
};

function usageNote(component: SalaryComponent): string {
  if (component.employeeCount > 0) return `Dipakai ${component.employeeCount} karyawan`;
  return component.inUse ? "Hanya di riwayat gaji" : "Belum dipakai";
}

// Katalog komponen gaji (pola OrgListCard): aktif dulu, lalu yang diarsipkan (diredupkan). Tanpa overflow-hidden agar
// dropdown aksi tidak terpotong. Gaji pokok selalu ada, jadi daftar tidak pernah kosong.
export function SalaryComponentList({ components }: Props) {
  const active = components.filter((component) => !component.archived).length;

  return (
    <section aria-labelledby="salary-components-title" className="glass-strong flex flex-col rounded-card">
      <div className="flex items-start justify-between gap-4 px-5 pt-5 pb-3 lg:px-6">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 id="salary-components-title" className="font-display text-h2 font-bold text-text-primary">
            Komponen gaji <span className="font-medium text-text-tertiary tabular-nums">{active}</span>
          </h2>
          <p className="text-small text-text-secondary">
            Daftar komponen yang bisa dipilih saat mengatur gaji karyawan. Jenis menentukan perlakuan BPJS, prorata, dan potongan absensi.
          </p>
        </div>
        <AddSalaryComponentButton />
      </div>
      <ul>
        {components.map((component) => (
          <li key={component.id} className="flex min-h-15 items-center gap-3 border-t border-border-subtle px-5 py-2.5 lg:px-6">
            <div className="flex min-w-0 flex-1 flex-col">
              <div className="flex min-w-0 items-center gap-2">
                <p className={`truncate text-[15px] font-bold ${component.archived ? "text-text-secondary" : "text-text-primary"}`}>{component.name}</p>
                {component.archived ? <Badge tone="outline">Diarsipkan</Badge> : null}
              </div>
              <p className="text-small text-text-secondary">
                {COMPONENT_KIND_LABELS[component.kind]} · <span className="tabular-nums">{usageNote(component)}</span>
              </p>
            </div>
            <SalaryComponentActions component={component} />
          </li>
        ))}
      </ul>
    </section>
  );
}

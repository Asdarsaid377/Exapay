import type { KpiTemplate } from "@exapay/shared";

import { Badge } from "@/components/common/Badge";
import { KpiTemplateActions } from "@/components/kpi/KpiTemplateActions";
import { formatIndicatorTarget, INDICATOR_TYPE_LABELS } from "@/lib/kpiTemplateLabels";

type Props = {
  template: KpiTemplate;
};

// Satu template KPI: nama, jabatan pemakai, lalu indikator (tipe, target, bobot).
// Tanpa overflow-hidden: dropdown aksi tidak terpotong.
export function KpiTemplateCard({ template }: Props) {
  const titleId = `kpi-template-${template.id}`;
  const positionNames = template.positions.map((position) => position.name).join(", ");

  return (
    <section aria-labelledby={titleId} className="glass-strong flex flex-col rounded-card">
      <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3 lg:px-6">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id={titleId} className="font-display text-h2 font-bold text-text-primary">
              {template.name}
            </h2>
            {template.builtin ? <Badge tone="neutral">Bawaan</Badge> : null}
          </div>
          {template.description ? <p className="text-small text-text-secondary text-pretty">{template.description}</p> : null}
          <p className="text-small text-text-secondary">
            {positionNames ? (
              <>
                <span className="font-bold text-text-primary">Jabatan:</span> {positionNames}
              </>
            ) : (
              <span className="text-warning-text">Belum dipakai jabatan mana pun</span>
            )}
          </p>
        </div>
        <KpiTemplateActions template={{ id: template.id, name: template.name, positionCount: template.positions.length }} />
      </div>

      <ul>
        {template.indicators.map((indicator) => (
          <li key={indicator.id} className="flex items-center gap-3 border-t border-border-subtle px-5 py-3 lg:px-6">
            <div className="flex min-w-0 flex-1 flex-col">
              <p className="text-[14.5px] font-bold text-text-primary">{indicator.name}</p>
              <p className="text-small text-text-secondary">
                {INDICATOR_TYPE_LABELS[indicator.type]} · <span className="tabular-nums">{formatIndicatorTarget(indicator)}</span>
              </p>
            </div>
            <p className="shrink-0 font-display text-[17px] font-bold text-text-primary tabular-nums">
              {indicator.weight}
              <span className="text-small font-medium text-text-tertiary">%</span>
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

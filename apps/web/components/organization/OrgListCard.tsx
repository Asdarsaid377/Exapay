import type { OrgItem, OrgKind } from "@exapay/shared";
import { Briefcase, Network } from "lucide-react";

import { EmptyState } from "@/components/common/EmptyState";
import { AddOrgItemButton } from "@/components/organization/AddOrgItemButton";
import { OrgItemActions } from "@/components/organization/OrgItemActions";
import { formatShortDate } from "@/lib/datetime";
import { ORG_LABELS } from "@/lib/organizationLabels";

type Props = {
  kind: OrgKind;
  items: OrgItem[];
  canManage: boolean;
};

const ICONS = { departments: Network, positions: Briefcase } as const;

// Satu daftar (departemen atau jabatan) di card kaca kuat. Tanpa overflow-hidden: dropdown aksi tidak terpotong.
export function OrgListCard({ kind, items, canManage }: Props) {
  const labels = ORG_LABELS[kind];
  const titleId = `${kind}-title`;

  return (
    <section aria-labelledby={titleId} className="glass-strong flex flex-col rounded-card">
      <div className="flex items-start justify-between gap-4 px-5 pt-5 pb-3 lg:px-6">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 id={titleId} className="font-display text-h2 font-bold text-text-primary">
            {labels.title} <span className="font-medium text-text-tertiary tabular-nums">{items.length}</span>
          </h2>
          <p className="text-small text-text-secondary">{labels.description}</p>
        </div>
        {canManage && items.length > 0 ? <AddOrgItemButton kind={kind} /> : null}
      </div>

      {items.length === 0 ? (
        <div className="border-t border-border-subtle">
          <EmptyState
            surface="none"
            icon={ICONS[kind]}
            title={labels.emptyTitle}
            description={canManage ? labels.emptyDescription : "Pemilik atau admin usaha belum menambahkannya."}
            action={canManage ? <AddOrgItemButton kind={kind} variant="primary" /> : undefined}
          />
        </div>
      ) : (
        <ul>
          {items.map((item) => (
            <li key={item.id} className="flex min-h-15 items-center gap-3 border-t border-border-subtle px-5 py-2.5 lg:px-6">
              <div className="flex min-w-0 flex-1 flex-col">
                <p className="truncate text-[15px] font-bold text-text-primary">{item.name}</p>
                <p className="text-caption text-text-tertiary">Ditambahkan {formatShortDate(item.createdAt)}</p>
              </div>
              {canManage ? <OrgItemActions kind={kind} item={{ id: item.id, name: item.name }} /> : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

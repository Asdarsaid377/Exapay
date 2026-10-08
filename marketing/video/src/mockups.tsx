// Merender komponen mockup landing page ASLI (apps/web/components/landing) menjadi HTML statis untuk scene video.
// Data di dalamnya data demo landing (Kopi Nusantara) — tidak ada data pelanggan. Dibundel oleh render.mjs (esbuild).
import { CircleCheck, FileSpreadsheet, Mail, Sparkles, X } from "lucide-react";
import { renderToStaticMarkup } from "react-dom/server";

import { ComplianceRemindersPreview } from "@/components/landing/ComplianceRemindersPreview";
import { HeroPreview } from "@/components/landing/HeroPreview";
import { KpiPreview } from "@/components/landing/KpiPreview";
import { PortalPreview } from "@/components/landing/PortalPreview";
import { SlipPreview } from "@/components/landing/SlipPreview";

// Ikon diberi size-full; scene membungkusnya dengan span berukuran
const icon = (Icon: typeof Mail) => renderToStaticMarkup(<Icon aria-hidden className="size-full" />);

export function renderMockups() {
  return {
    hero: renderToStaticMarkup(<HeroPreview />),
    kpi: renderToStaticMarkup(<KpiPreview />),
    slip: renderToStaticMarkup(<SlipPreview />),
    compliance: renderToStaticMarkup(<ComplianceRemindersPreview />),
    portal: renderToStaticMarkup(<PortalPreview />),
    icons: {
      circleCheck: icon(CircleCheck),
      mail: icon(Mail),
      sheet: icon(FileSpreadsheet),
      sparkles: icon(Sparkles),
      x: icon(X),
    },
  };
}

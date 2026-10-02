import { AttendancePreview } from "@/components/landing/AttendancePreview";
import { ComplianceRemindersPreview } from "@/components/landing/ComplianceRemindersPreview";
import { FeatureBlock } from "@/components/landing/FeatureBlock";
import { FeaturePoints } from "@/components/landing/FeaturePoints";
import { KpiPreview } from "@/components/landing/KpiPreview";
import { PortalPreview } from "@/components/landing/PortalPreview";
import { SectionIntro } from "@/components/landing/SectionIntro";
import { SlipPreview } from "@/components/landing/SlipPreview";
import { LANDING_FEATURE_POINTS } from "@/lib/landingContent";

// Section fitur (#fitur, snapshot landing.html): 5 blok selang-seling; Tugas harian → KPI (pembeda) di panel kaca besar
export function LandingFeatures() {
  return (
    <section id="fitur" className="flex scroll-mt-24 flex-col gap-12 pb-section-sm lg:gap-18 lg:pb-section">
      <SectionIntro title="Yang dikerjakan Exapay untuk Anda">
        Sistem menghitung, memandu, dan mengingatkan. Keputusan tetap di tangan Anda dan atasan.
      </SectionIntro>

      <FeatureBlock
        title="Payroll & PPh 21 TER"
        description="Gaji dihitung lengkap dengan BPJS dan PPh 21. Anda tinggal meninjau draf, lalu mengunci."
        points={LANDING_FEATURE_POINTS.payroll}
        preview={<SlipPreview />}
      />
      <FeatureBlock
        title="Absensi dari HP"
        description="Karyawan absen dari HP-nya sendiri. Jamnya diambil dari server, bukan dari jam HP."
        points={LANDING_FEATURE_POINTS.attendance}
        preview={<AttendancePreview />}
        previewFirst
        previewDesktopOnly
      />

      <div className="glass-strong -mx-2 grid items-center gap-4 rounded-[26px] px-5 py-6 lg:mx-0 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-14 lg:rounded-sheet lg:p-14">
        <div className="contents flex-col gap-5.5 lg:flex">
          <h3 className="text-balance font-display text-[26px] leading-[1.15] font-extrabold tracking-[-0.025em] lg:text-feature-lg">
            Tugas harian jadi skor kinerja yang bisa dijelaskan
          </h3>
          <p className="text-[15.5px] leading-[1.55] text-pretty text-text-secondary lg:text-lg">
            Karyawan mencatat hasil kerjanya, atasan memverifikasi, lalu skor 0–100 dihitung dengan rumus yang bisa dilihat semua orang. Saat penilaian,
            tidak ada lagi “kira-kira”.
          </p>
          <div className="order-last lg:order-none">
            <FeaturePoints points={LANDING_FEATURE_POINTS.kpi} large />
          </div>
          <span className="order-last font-mono text-[13px] text-text-secondary lg:order-none lg:text-sm">skor = Σ (realisasi ÷ target × bobot)</span>
        </div>
        <KpiPreview />
      </div>

      <FeatureBlock
        title="Kepatuhan"
        description="Tenggat dan batas aturan muncul sebelum terlambat — di dashboard, dan lewat email H-7 serta H-1."
        points={LANDING_FEATURE_POINTS.compliance}
        preview={<ComplianceRemindersPreview />}
      />
      <FeatureBlock
        title="Portal karyawan"
        description="Aplikasi web yang bisa dipasang di layar utama HP karyawan — tanpa unduh dari toko aplikasi."
        points={LANDING_FEATURE_POINTS.portal}
        preview={<PortalPreview />}
        previewFirst
        previewDesktopOnly
      />
    </section>
  );
}

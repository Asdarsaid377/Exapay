import { SectionIntro } from "@/components/landing/SectionIntro";
import { LANDING_PROBLEMS } from "@/lib/landingContent";

// "Masih begini di usaha Anda?" — tabel Sekarang / Dengan Exapay (desktop), kartu bertumpuk (mobile). Teks saja, tanpa ikon.
export function LandingProblems() {
  return (
    <section className="flex flex-col gap-6 pb-section-sm lg:gap-10 lg:pb-section">
      <SectionIntro title="Masih begini di usaha Anda?">
        Hampir semua usaha kecil mulai dari Excel dan grup WhatsApp. Masalahnya muncul saat karyawan bertambah dan aturan berubah.
      </SectionIntro>

      <div className="glass-strong hidden overflow-hidden rounded-card lg:block">
        <div className="grid grid-cols-2 bg-table-head font-display text-sm font-bold">
          <span className="px-8 py-4 text-text-secondary">Sekarang</span>
          <span className="border-l border-border-subtle px-8 py-4 text-accent-strong">Dengan Exapay</span>
        </div>
        {LANDING_PROBLEMS.map((problem) => (
          <div key={problem.before} className="grid grid-cols-2 border-t border-border-subtle text-[17px] leading-normal">
            <p className="px-8 py-6 text-pretty text-text-secondary">{problem.before}</p>
            <p className="border-l border-border-subtle bg-surface-solid px-8 py-6 font-medium text-pretty">{problem.after}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-4 lg:hidden">
        {LANDING_PROBLEMS.map((problem) => (
          <div key={problem.before} className="overflow-hidden rounded-[20px] border border-border-glass-strong bg-surface-glass-data shadow-glass">
            <div className="flex flex-col gap-1 px-4.5 py-4">
              <span className="font-display text-[12.5px] font-bold text-text-secondary">Sekarang</span>
              <span className="text-[15px] leading-normal text-text-secondary">{problem.before}</span>
            </div>
            <div className="flex flex-col gap-1 border-t border-border-subtle bg-surface-solid px-4.5 py-4">
              <span className="font-display text-[12.5px] font-bold text-accent-strong">Dengan Exapay</span>
              <span className="text-[15px] leading-normal font-medium">{problem.after}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

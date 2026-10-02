import { BpjsParticipationPreview } from "@/components/landing/BpjsParticipationPreview";
import { SectionIntro } from "@/components/landing/SectionIntro";
import { LANDING_START_POINTS } from "@/lib/landingContent";

// Revisi user 2026-10-02 (tanpa snapshot — pola section fitur landing.html): Exapay juga untuk UMKM yang belum
// menjalankan semua regulasi (PPh 21, BPJS, UMK), bukan hanya perusahaan besar.
export function LandingStartWhereYouAre() {
  return (
    <section className="flex flex-col gap-8 pb-section-sm lg:gap-10 lg:pb-section">
      <SectionIntro title="Mulai dari kondisi usaha Anda sekarang">
        Exapay dibuat untuk usaha kecil — kedai, toko, bengkel, klinik — bukan hanya perusahaan besar yang sudah punya HRD. Anda tidak harus sudah tertib semua aturan untuk mulai.
      </SectionIntro>
      <div className="grid items-center gap-8 lg:grid-cols-2 lg:gap-18">
        <div className="flex flex-col gap-5">
          <div className="flex flex-col">
            {LANDING_START_POINTS.map((point) => (
              <div key={point.title} className="flex flex-col gap-1 border-t border-text-primary/10 py-3.5">
                <h3 className="font-display text-base font-bold lg:text-[17px]">{point.title}</h3>
                <p className="text-[14.5px] leading-normal text-pretty text-text-secondary lg:text-[15.5px]">{point.body}</p>
              </div>
            ))}
          </div>
          <p className="text-[15px] leading-normal text-pretty text-text-primary">
            Saat usaha Anda tumbuh, Exapay membantu menertibkan aturan satu per satu — dengan pengingat, bukan paksaan.
          </p>
        </div>
        <BpjsParticipationPreview />
      </div>
    </section>
  );
}

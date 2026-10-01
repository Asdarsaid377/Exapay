import { KPI_PREDICATE_LABELS, type KpiSummaryInput, kpiSummaryInputSchema } from "@exapay/shared";

import { AiProvider, type AiTextRequest, type AiTextResult } from "./ai-provider.js";

// Provider palsu untuk development/test tanpa ANTHROPIC_API_KEY (tanpa biaya, deterministik). Menulis narasi sederhana
// dari data di tag <data> agar alur antrean → narasi → tinjau → final bisa diverifikasi ujung ke ujung.
export class FakeAiProvider extends AiProvider {
  readonly name = "fake";

  async generateText(request: AiTextRequest): Promise<AiTextResult> {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const raw = /<data>([\s\S]*)<\/data>/.exec(request.prompt)?.[1];
    const parsed = raw ? kpiSummaryInputSchema.safeParse(JSON.parse(raw)) : null;
    const text = parsed?.success ? narrate(parsed.data) : "Ringkasan contoh dari mode pengembangan.";
    return { text, model: "fake-dev", inputTokens: null, outputTokens: null };
  }
}

function narrate(input: KpiSummaryInput): string {
  const scored = input.indicators.filter((indicator) => indicator.status === "scored" && indicator.achievement !== null);
  const sorted = [...scored].sort((a, b) => Number(b.achievement) - Number(a.achievement));
  const best = sorted[0];
  const worst = sorted.length > 1 ? sorted[sorted.length - 1] : undefined;
  const summary =
    input.score === null || input.predicate === null
      ? "Pada periode ini belum ada indikator yang bisa dihitung sehingga skor belum terbentuk."
      : `Pada periode ini karyawan memperoleh skor ${input.score} dengan predikat ${KPI_PREDICATE_LABELS[input.predicate]}. Dari ${input.days.targetDays} hari kerja, karyawan hadir ${input.days.present} hari dan alpa ${input.days.absent} hari.`;
  const strength = best ? `Capaian tertinggi ada pada indikator "${best.name}" (${best.achievement}% dari target).` : "Belum ada indikator dengan capaian yang tercatat.";
  const improve = worst
    ? `Indikator "${worst.name}" (${worst.achievement}% dari target) perlu mendapat perhatian pada periode berikutnya.`
    : "Pertahankan pencatatan tugas harian agar penilaian berikutnya lebih lengkap.";
  return `${summary}\n\n${strength}\n\n${improve}\n\n(Narasi contoh dari mode pengembangan — ANTHROPIC_API_KEY belum diisi.)`;
}

// Lapisan abstraksi provider AI (feature 23). Processor hanya mengenal kelas ini — ganti/tambah provider tanpa mengubah
// alur antrean. Implementasi: AnthropicAiProvider (Claude) dan FakeAiProvider (dev/test tanpa API key).

export type AiTextRequest = {
  system: string;
  prompt: string;
  maxTokens: number;
};

export type AiTextResult = {
  text: string;
  // Model yang benar-benar menjawab (bisa berbeda jika provider memakai fallback)
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
};

// userMessage aman ditampilkan ke pengguna; detail teknis hanya di log. permanent = jangan dicoba ulang.
export class AiProviderError extends Error {
  constructor(
    message: string,
    readonly userMessage: string,
    readonly permanent: boolean,
  ) {
    super(message);
    this.name = "AiProviderError";
  }
}

export abstract class AiProvider {
  abstract readonly name: string;
  abstract generateText(request: AiTextRequest): Promise<AiTextResult>;
}

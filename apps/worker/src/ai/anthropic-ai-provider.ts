import Anthropic from "@anthropic-ai/sdk";

import { AiProvider, AiProviderError, type AiTextRequest, type AiTextResult } from "./ai-provider.js";

const UNAVAILABLE = "Layanan AI sedang sibuk atau tidak terjangkau. Silakan coba buat ulang beberapa saat lagi.";
const MISCONFIGURED = "Layanan AI belum dikonfigurasi dengan benar. Hubungi admin platform.";

// Claude lewat SDK resmi. Fallback server-side "default" aktif: jika model utama menolak (stop_reason refusal) permintaan
// dijalankan ulang di model cadangan dalam panggilan yang sama.
export class AnthropicAiProvider extends AiProvider {
  readonly name = "anthropic";
  private readonly client: Anthropic;

  constructor(
    apiKey: string,
    private readonly model: string,
  ) {
    super();
    this.client = new Anthropic({ apiKey, maxRetries: 2, timeout: 120_000 });
  }

  async generateText(request: AiTextRequest): Promise<AiTextResult> {
    let response: Anthropic.Beta.BetaMessage;
    try {
      response = await this.client.beta.messages.create({
        model: this.model,
        max_tokens: request.maxTokens,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        // Narasi pendek dari data yang sudah dihitung — tidak butuh penalaran berat
        output_config: { effort: "medium" },
        system: request.system,
        messages: [{ role: "user", content: request.prompt }],
      });
    } catch (error) {
      throw this.translate(error);
    }

    if (response.stop_reason === "refusal") {
      throw new AiProviderError(
        `[ai/anthropic] refusal: ${response.stop_details?.category ?? "tanpa kategori"}`,
        "AI tidak dapat membuat ringkasan untuk data ini. Silakan tulis ringkasan sendiri.",
        true,
      );
    }
    if (response.stop_reason === "max_tokens") {
      throw new AiProviderError("[ai/anthropic] berhenti karena max_tokens", "Ringkasan AI terpotong. Silakan coba buat ulang.", false);
    }
    const text = response.content
      .flatMap((block) => (block.type === "text" ? [block.text] : []))
      .join("")
      .trim();
    if (!text) throw new AiProviderError("[ai/anthropic] respons tanpa teks", "AI tidak mengembalikan ringkasan. Silakan coba buat ulang.", false);
    return { text, model: response.model, inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens };
  }

  // Urutan dari yang paling spesifik: konfigurasi salah (permanen) → dapat dicoba ulang (429, 5xx, jaringan)
  private translate(error: unknown): Error {
    if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError || error instanceof Anthropic.NotFoundError) {
      return new AiProviderError(`[ai/anthropic] ${error.status}: ${error.message}`, MISCONFIGURED, true);
    }
    if (error instanceof Anthropic.BadRequestError || error instanceof Anthropic.UnprocessableEntityError) {
      return new AiProviderError(`[ai/anthropic] ${error.status}: ${error.message}`, "Permintaan ringkasan AI ditolak layanan AI. Hubungi admin platform.", true);
    }
    if (error instanceof Anthropic.RateLimitError || error instanceof Anthropic.InternalServerError || error instanceof Anthropic.APIConnectionError) {
      return new AiProviderError(`[ai/anthropic] ${error.message}`, UNAVAILABLE, false);
    }
    if (error instanceof Anthropic.APIError) {
      return new AiProviderError(`[ai/anthropic] ${error.status ?? "?"}: ${error.message}`, UNAVAILABLE, false);
    }
    return error instanceof Error ? error : new Error(String(error));
  }
}

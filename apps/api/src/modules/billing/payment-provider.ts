import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { toBuffer } from "qrcode";

import type { Env } from "../../common/config/env.js";
import { qrisWithAmount } from "./qris.js";

// Abstraksi cara bayar tagihan langganan (Phase 9). Implementasi saat ini "qris-manual": QRIS statik merchant
// dibuat dinamis per tagihan, TANPA notifikasi pembayaran — lunas dikonfirmasi super-admin (feature 42). Gateway
// ber-webhook nanti cukup menambah implementasi baru; tagihan menyimpan payment_method yang dipakai.
export abstract class PaymentProvider {
  abstract readonly method: string;
  // false → instruksi bayar tidak bisa ditampilkan (mis. QRIS merchant belum dipasang)
  abstract available(): boolean;
  // Gambar QR (PNG) untuk nominal persis tagihan
  abstract qrImage(totalAmount: string): Promise<Buffer>;
}

@Injectable()
export class QrisManualPaymentProvider extends PaymentProvider {
  readonly method = "qris-manual";
  private readonly staticPayload: string | undefined;

  constructor(config: ConfigService<Env, true>) {
    super();
    // Divalidasi saat start (env.ts) — payload rusak menggagalkan start, bukan QR yang tidak bisa dibayar
    this.staticPayload = config.get("QRIS_STATIC_PAYLOAD", { infer: true });
  }

  available(): boolean {
    return this.staticPayload !== undefined;
  }

  async qrImage(totalAmount: string): Promise<Buffer> {
    if (!this.staticPayload) throw new Error("[billing/qris] QRIS_STATIC_PAYLOAD belum diisi");
    return toBuffer(qrisWithAmount(this.staticPayload, totalAmount), { type: "png", errorCorrectionLevel: "M", margin: 2, width: 480 });
  }
}

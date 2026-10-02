import {
  type ApiResponse,
  type PaymentConfirmation,
  type PaymentConfirmationRejectInput,
  paymentConfirmationRejectSchema,
  type PaymentConfirmationTokenInput,
  paymentConfirmationTokenSchema,
} from "@exapay/shared";
import { Body, Controller, HttpCode, HttpStatus, Post, StreamableFile } from "@nestjs/common";

import { Public } from "../../common/auth/public.decorator.js";
import { ZodValidationPipe } from "../../common/validation/zod-validation.pipe.js";
import { PaymentConfirmationsService } from "./payment-confirmations.service.js";

// Konfirmasi pembayaran dari tautan email tanpa login (feature 42). Token di body (bukan path) agar tidak tercatat di log
// akses — pola /invitations/lookup. Token acak 256-bit sekali pakai; lookup & bukti hanya membaca.
@Controller("billing/confirmations")
@Public()
export class PaymentConfirmationsController {
  constructor(private readonly confirmations: PaymentConfirmationsService) {}

  @Post("lookup")
  @HttpCode(HttpStatus.OK)
  async lookup(@Body(new ZodValidationPipe(paymentConfirmationTokenSchema)) body: PaymentConfirmationTokenInput): Promise<ApiResponse<PaymentConfirmation>> {
    return { success: true, data: await this.confirmations.lookup(body.token) };
  }

  @Post("confirm")
  @HttpCode(HttpStatus.OK)
  async confirm(@Body(new ZodValidationPipe(paymentConfirmationTokenSchema)) body: PaymentConfirmationTokenInput): Promise<ApiResponse<PaymentConfirmation>> {
    return { success: true, data: await this.confirmations.decide(body.token, { kind: "confirm" }) };
  }

  @Post("reject")
  @HttpCode(HttpStatus.OK)
  async reject(@Body(new ZodValidationPipe(paymentConfirmationRejectSchema)) body: PaymentConfirmationRejectInput): Promise<ApiResponse<PaymentConfirmation>> {
    return { success: true, data: await this.confirmations.decide(body.token, { kind: "reject", reason: body.reason }) };
  }

  @Post("proof")
  @HttpCode(HttpStatus.OK)
  async proof(@Body(new ZodValidationPipe(paymentConfirmationTokenSchema)) body: PaymentConfirmationTokenInput): Promise<StreamableFile> {
    const file = await this.confirmations.proof(body.token);
    return new StreamableFile(file.buffer, {
      type: file.contentType,
      disposition: `inline; filename="bukti"; filename*=UTF-8''${encodeURIComponent(file.name)}`,
      length: file.buffer.length,
    });
  }
}

import { type ApiResponse, BILLING_PROOF_MAX_BYTES, type BillingInvoice, type BillingOverview, type SubscriptionSummary } from "@exapay/shared";
import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";

import { AllowWhenReadOnly } from "../../common/auth/allow-when-read-only.decorator.js";
import type { AuthUser } from "../../common/auth/auth-user.js";
import { CurrentUser } from "../../common/auth/current-user.decorator.js";
import { Roles } from "../../common/auth/roles.decorator.js";
import type { UploadedAttachment } from "../attendance/leave-requests.service.js";
import { BillingService } from "./billing.service.js";

const INVOICE_ID = new ParseUUIDPipe({ exceptionFactory: () => new NotFoundException("Tagihan tidak ditemukan") });
// Bukti bayar disimpan di memori lalu diteruskan ke storage S3; batas ukuran di multer (413)
const upload = FileInterceptor("proof", { limits: { fileSize: BILLING_PROOF_MAX_BYTES, files: 1 } });

// Langganan usaha aktif (feature 40) + tagihan & pembayaran QRIS (feature 41). GET tetap terbuka saat baca-saja
// (SubscriptionGuard hanya menahan mutasi); klaim bayar dikecualikan agar usaha baca-saja bisa melunasi.
@Controller("billing")
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  // Halaman /settings/billing — khusus owner (build-plan feature 40)
  @Get()
  @Roles("owner")
  async overview(@CurrentUser() user: AuthUser): Promise<ApiResponse<BillingOverview>> {
    return { success: true, data: await this.billingService.overview(user) };
  }

  // Banner pengingat di AppShell — owner & admin
  @Get("status")
  @Roles("owner", "admin")
  async status(@CurrentUser() user: AuthUser): Promise<ApiResponse<SubscriptionSummary>> {
    return { success: true, data: await this.billingService.status(user) };
  }

  // Gambar QRIS dinamis (PNG) bernominal persis — ditampilkan & bisa diunduh
  @Get("invoices/:id/qris")
  @Roles("owner")
  async qris(@CurrentUser() user: AuthUser, @Param("id", INVOICE_ID) id: string): Promise<StreamableFile> {
    const image = await this.billingService.qrImage(user, id);
    return new StreamableFile(image.buffer, {
      type: "image/png",
      disposition: `inline; filename="${image.fileName}"`,
      length: image.buffer.length,
    });
  }

  // multipart/form-data: proof (opsional, PDF/JPG/PNG maks. 5 MB)
  @Post("invoices/:id/claim")
  @HttpCode(HttpStatus.OK)
  @Roles("owner")
  @AllowWhenReadOnly()
  @UseInterceptors(upload)
  async claim(
    @CurrentUser() user: AuthUser,
    @Param("id", INVOICE_ID) id: string,
    @UploadedFile() file: UploadedAttachment | undefined,
  ): Promise<ApiResponse<BillingInvoice>> {
    return { success: true, data: await this.billingService.claim(user, id, file ?? null) };
  }
}

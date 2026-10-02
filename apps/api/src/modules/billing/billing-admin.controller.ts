import {
  type AdminBillingOverview,
  type AdminTenantSubscription,
  type ApiResponse,
  type BillingPriceInput,
  billingPriceInputSchema,
  type BillingPriceVersion,
  type ExtendTrialInput,
  extendTrialSchema,
  type RejectPaymentInput,
  rejectPaymentSchema,
  type TenantPriceOverrideInput,
  tenantPriceOverrideSchema,
} from "@exapay/shared";
import { Body, Controller, Get, HttpCode, HttpStatus, NotFoundException, Param, ParseUUIDPipe, Post, Put, StreamableFile } from "@nestjs/common";

import type { AuthUser } from "../../common/auth/auth-user.js";
import { CurrentUser } from "../../common/auth/current-user.decorator.js";
import { SuperAdmin } from "../../common/auth/super-admin.decorator.js";
import { ZodValidationPipe } from "../../common/validation/zod-validation.pipe.js";
import { BillingAdminService } from "./billing-admin.service.js";

const TENANT_ID = new ParseUUIDPipe({ exceptionFactory: () => new NotFoundException("Tenant tidak ditemukan") });
const INVOICE_ID = new ParseUUIDPipe({ exceptionFactory: () => new NotFoundException("Tagihan tidak ditemukan") });

// Panel super-admin tagihan & langganan (feature 42): /admin/billing (antrean konfirmasi + harga platform) dan
// langganan per tenant di /admin/tenants/:id. Hanya data tingkat platform.
@Controller("admin")
@SuperAdmin()
export class BillingAdminController {
  constructor(private readonly billingAdmin: BillingAdminService) {}

  @Get("billing")
  async overview(@CurrentUser() user: AuthUser): Promise<ApiResponse<AdminBillingOverview>> {
    return { success: true, data: await this.billingAdmin.overview(user) };
  }

  @Post("billing/prices")
  async addPrice(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(billingPriceInputSchema)) body: BillingPriceInput,
  ): Promise<ApiResponse<BillingPriceVersion[]>> {
    return { success: true, data: await this.billingAdmin.addPrice(user, body) };
  }

  @Post("tenants/:tenantId/invoices/:id/confirm")
  @HttpCode(HttpStatus.OK)
  async confirm(@CurrentUser() user: AuthUser, @Param("tenantId", TENANT_ID) tenantId: string, @Param("id", INVOICE_ID) id: string): Promise<ApiResponse<null>> {
    await this.billingAdmin.decide(user, tenantId, id, { kind: "confirm" });
    return { success: true, data: null };
  }

  @Post("tenants/:tenantId/invoices/:id/reject")
  @HttpCode(HttpStatus.OK)
  async reject(
    @CurrentUser() user: AuthUser,
    @Param("tenantId", TENANT_ID) tenantId: string,
    @Param("id", INVOICE_ID) id: string,
    @Body(new ZodValidationPipe(rejectPaymentSchema)) body: RejectPaymentInput,
  ): Promise<ApiResponse<null>> {
    await this.billingAdmin.decide(user, tenantId, id, { kind: "reject", reason: body.reason });
    return { success: true, data: null };
  }

  @Get("tenants/:tenantId/invoices/:id/proof")
  async proof(@CurrentUser() user: AuthUser, @Param("tenantId", TENANT_ID) tenantId: string, @Param("id", INVOICE_ID) id: string): Promise<StreamableFile> {
    const file = await this.billingAdmin.proof(user, tenantId, id);
    return new StreamableFile(file.buffer, {
      type: file.contentType,
      disposition: `inline; filename="bukti"; filename*=UTF-8''${encodeURIComponent(file.name)}`,
      length: file.buffer.length,
    });
  }

  @Get("tenants/:tenantId/subscription")
  async subscription(@CurrentUser() user: AuthUser, @Param("tenantId", TENANT_ID) tenantId: string): Promise<ApiResponse<AdminTenantSubscription>> {
    return { success: true, data: await this.billingAdmin.tenantSubscription(user, tenantId) };
  }

  @Post("tenants/:tenantId/subscription/trial")
  @HttpCode(HttpStatus.OK)
  async extendTrial(
    @CurrentUser() user: AuthUser,
    @Param("tenantId", TENANT_ID) tenantId: string,
    @Body(new ZodValidationPipe(extendTrialSchema)) body: ExtendTrialInput,
  ): Promise<ApiResponse<null>> {
    await this.billingAdmin.extendTrial(user, tenantId, body);
    return { success: true, data: null };
  }

  @Post("tenants/:tenantId/subscription/complimentary")
  @HttpCode(HttpStatus.OK)
  async setComplimentary(@CurrentUser() user: AuthUser, @Param("tenantId", TENANT_ID) tenantId: string): Promise<ApiResponse<null>> {
    await this.billingAdmin.setComplimentary(user, tenantId);
    return { success: true, data: null };
  }

  @Put("tenants/:tenantId/subscription/price")
  async setPrice(
    @CurrentUser() user: AuthUser,
    @Param("tenantId", TENANT_ID) tenantId: string,
    @Body(new ZodValidationPipe(tenantPriceOverrideSchema)) body: TenantPriceOverrideInput,
  ): Promise<ApiResponse<null>> {
    await this.billingAdmin.setPriceOverride(user, tenantId, body);
    return { success: true, data: null };
  }
}

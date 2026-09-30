import {
  type AdminTenantDetail,
  type AdminTenantList,
  type AdminTenantListQuery,
  adminTenantListQuerySchema,
  type ApiResponse,
  type CreatedTenant,
  type CreateTenantInput,
  createTenantSchema,
} from "@exapay/shared";
import { Body, Controller, Get, HttpCode, HttpStatus, NotFoundException, Param, ParseUUIDPipe, Post, Query } from "@nestjs/common";

import type { AuthUser } from "../../common/auth/auth-user.js";
import { CurrentUser } from "../../common/auth/current-user.decorator.js";
import { SuperAdmin } from "../../common/auth/super-admin.decorator.js";
import { ZodValidationPipe } from "../../common/validation/zod-validation.pipe.js";
import { TenantsAdminService } from "./tenants-admin.service.js";

// Id bukan UUID → diperlakukan sama dengan tenant yang tidak ada
const TENANT_ID = new ParseUUIDPipe({ exceptionFactory: () => new NotFoundException("Tenant tidak ditemukan") });

// Panel super-admin (feature 07). Hanya data tingkat platform — tidak ada endpoint data karyawan/gaji di sini.
@Controller("admin/tenants")
@SuperAdmin()
export class TenantsAdminController {
  constructor(private readonly tenantsAdminService: TenantsAdminService) {}

  @Get()
  async list(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(adminTenantListQuerySchema)) query: AdminTenantListQuery,
  ): Promise<ApiResponse<AdminTenantList>> {
    return { success: true, data: await this.tenantsAdminService.list(user, query) };
  }

  @Post()
  async create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createTenantSchema)) body: CreateTenantInput,
  ): Promise<ApiResponse<CreatedTenant>> {
    return { success: true, data: await this.tenantsAdminService.create(user, body) };
  }

  @Get(":id")
  async detail(@CurrentUser() user: AuthUser, @Param("id", TENANT_ID) id: string): Promise<ApiResponse<AdminTenantDetail>> {
    return { success: true, data: await this.tenantsAdminService.detail(user, id) };
  }

  @Post(":id/deactivate")
  @HttpCode(HttpStatus.OK)
  async deactivate(@CurrentUser() user: AuthUser, @Param("id", TENANT_ID) id: string): Promise<ApiResponse<null>> {
    await this.tenantsAdminService.setDeactivated(user, id, true);
    return { success: true, data: null };
  }

  @Post(":id/reactivate")
  @HttpCode(HttpStatus.OK)
  async reactivate(@CurrentUser() user: AuthUser, @Param("id", TENANT_ID) id: string): Promise<ApiResponse<null>> {
    await this.tenantsAdminService.setDeactivated(user, id, false);
    return { success: true, data: null };
  }

  @Post(":id/resend-owner-invitation")
  @HttpCode(HttpStatus.OK)
  async resendOwnerInvitation(@CurrentUser() user: AuthUser, @Param("id", TENANT_ID) id: string): Promise<ApiResponse<null>> {
    await this.tenantsAdminService.resendOwnerInvitation(user, id);
    return { success: true, data: null };
  }
}

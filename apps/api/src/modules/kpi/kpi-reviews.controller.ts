import {
  type ApiResponse,
  type CreateKpiReviewsInput,
  type CreateKpiReviewsResult,
  createKpiReviewsSchema,
  type KpiReviewDetail,
  type KpiReviewList,
  type KpiReviewListQuery,
  kpiReviewListQuerySchema,
  type KpiReviewRatingsInput,
  kpiReviewRatingsSchema,
  type KpiReviewStatusInput,
  kpiReviewStatusSchema,
  type KpiSettings,
  type KpiSettingsInput,
  kpiSettingsInputSchema,
} from "@exapay/shared";
import { Body, Controller, Get, HttpCode, HttpStatus, NotFoundException, Param, ParseUUIDPipe, Post, Put, Query } from "@nestjs/common";

import type { AuthUser } from "../../common/auth/auth-user.js";
import { CurrentUser } from "../../common/auth/current-user.decorator.js";
import { Roles } from "../../common/auth/roles.decorator.js";
import { ZodValidationPipe } from "../../common/validation/zod-validation.pipe.js";
import { KpiReviewsService } from "./kpi-reviews.service.js";

const REVIEW_ID = new ParseUUIDPipe({ exceptionFactory: () => new NotFoundException("Penilaian tidak ditemukan") });

// Siklus & penilaian KPI periodik (feature 22). Peran dibaca ulang dari DB di service; atasan hanya bawahan langsung.
@Controller("kpi")
export class KpiReviewsController {
  constructor(private readonly reviews: KpiReviewsService) {}

  @Get("settings")
  @Roles("owner", "admin")
  async settings(@CurrentUser() user: AuthUser): Promise<ApiResponse<KpiSettings>> {
    return { success: true, data: await this.reviews.settings(user) };
  }

  @Put("settings")
  @Roles("owner", "admin")
  async updateSettings(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(kpiSettingsInputSchema)) body: KpiSettingsInput,
  ): Promise<ApiResponse<KpiSettings>> {
    return { success: true, data: await this.reviews.updateSettings(user, body) };
  }

  @Get("reviews")
  @Roles("owner", "admin", "atasan")
  async list(@CurrentUser() user: AuthUser, @Query(new ZodValidationPipe(kpiReviewListQuerySchema)) query: KpiReviewListQuery): Promise<ApiResponse<KpiReviewList>> {
    return { success: true, data: await this.reviews.list(user, query) };
  }

  @Post("reviews")
  @Roles("owner", "admin")
  async create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createKpiReviewsSchema)) body: CreateKpiReviewsInput,
  ): Promise<ApiResponse<CreateKpiReviewsResult>> {
    return { success: true, data: await this.reviews.create(user, body) };
  }

  @Get("reviews/:id")
  @Roles("owner", "admin", "atasan")
  async detail(@CurrentUser() user: AuthUser, @Param("id", REVIEW_ID) id: string): Promise<ApiResponse<KpiReviewDetail>> {
    return { success: true, data: await this.reviews.detail(user, id) };
  }

  @Put("reviews/:id/ratings")
  @Roles("owner", "admin", "atasan")
  @HttpCode(HttpStatus.OK)
  async rate(
    @CurrentUser() user: AuthUser,
    @Param("id", REVIEW_ID) id: string,
    @Body(new ZodValidationPipe(kpiReviewRatingsSchema)) body: KpiReviewRatingsInput,
  ): Promise<ApiResponse<null>> {
    await this.reviews.rate(user, id, body);
    return { success: true, data: null };
  }

  @Post("reviews/:id/status")
  @Roles("owner", "admin")
  @HttpCode(HttpStatus.OK)
  async changeStatus(
    @CurrentUser() user: AuthUser,
    @Param("id", REVIEW_ID) id: string,
    @Body(new ZodValidationPipe(kpiReviewStatusSchema)) body: KpiReviewStatusInput,
  ): Promise<ApiResponse<null>> {
    await this.reviews.changeStatus(user, id, body);
    return { success: true, data: null };
  }
}

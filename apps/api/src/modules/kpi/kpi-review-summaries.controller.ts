import {
  type ApiResponse,
  type KpiReviewSummaryEditInput,
  kpiReviewSummaryEditSchema,
  type KpiReviewSummaryGenerateInput,
  kpiReviewSummaryGenerateSchema,
  type KpiReviewSummaryReviewInput,
  kpiReviewSummaryReviewSchema,
} from "@exapay/shared";
import { Body, Controller, HttpCode, HttpStatus, NotFoundException, Param, ParseUUIDPipe, Post, Put } from "@nestjs/common";

import type { AuthUser } from "../../common/auth/auth-user.js";
import { CurrentUser } from "../../common/auth/current-user.decorator.js";
import { Roles } from "../../common/auth/roles.decorator.js";
import { ZodValidationPipe } from "../../common/validation/zod-validation.pipe.js";
import { KpiReviewSummariesService } from "./kpi-review-summaries.service.js";

const REVIEW_ID = new ParseUUIDPipe({ exceptionFactory: () => new NotFoundException("Penilaian tidak ditemukan") });

// Ringkasan AI penilaian KPI (feature 23). Isi & status narasi dibaca lewat GET /kpi/reviews/:id. Hak tulis dicek di service.
@Controller("kpi/reviews/:id/summary")
export class KpiReviewSummariesController {
  constructor(private readonly summaries: KpiReviewSummariesService) {}

  // 202: narasi dibuat di latar (antrean) — pantau status lewat detail penilaian
  @Post("generate")
  @Roles("owner", "admin", "atasan")
  @HttpCode(HttpStatus.ACCEPTED)
  async generate(
    @CurrentUser() user: AuthUser,
    @Param("id", REVIEW_ID) id: string,
    @Body(new ZodValidationPipe(kpiReviewSummaryGenerateSchema)) body: KpiReviewSummaryGenerateInput,
  ): Promise<ApiResponse<null>> {
    await this.summaries.generate(user, id, body);
    return { success: true, data: null };
  }

  @Put()
  @Roles("owner", "admin", "atasan")
  @HttpCode(HttpStatus.OK)
  async edit(
    @CurrentUser() user: AuthUser,
    @Param("id", REVIEW_ID) id: string,
    @Body(new ZodValidationPipe(kpiReviewSummaryEditSchema)) body: KpiReviewSummaryEditInput,
  ): Promise<ApiResponse<null>> {
    await this.summaries.edit(user, id, body);
    return { success: true, data: null };
  }

  @Post("review")
  @Roles("owner", "admin", "atasan")
  @HttpCode(HttpStatus.OK)
  async markReviewed(
    @CurrentUser() user: AuthUser,
    @Param("id", REVIEW_ID) id: string,
    @Body(new ZodValidationPipe(kpiReviewSummaryReviewSchema)) body: KpiReviewSummaryReviewInput,
  ): Promise<ApiResponse<null>> {
    await this.summaries.markReviewed(user, id, body);
    return { success: true, data: null };
  }
}

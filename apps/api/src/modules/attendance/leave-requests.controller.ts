import {
  type ApiResponse,
  type LeaveDecisionData,
  leaveDecisionSchema,
  type LeaveRequestList,
  type LeaveRequestListQuery,
  leaveRequestListQuerySchema,
  MEMBERSHIP_ROLES,
} from "@exapay/shared";
import { Body, Controller, Get, HttpCode, HttpStatus, NotFoundException, Param, ParseUUIDPipe, Post, Query, StreamableFile } from "@nestjs/common";

import type { AuthUser } from "../../common/auth/auth-user.js";
import { CurrentUser } from "../../common/auth/current-user.decorator.js";
import { Roles } from "../../common/auth/roles.decorator.js";
import { ZodValidationPipe } from "../../common/validation/zod-validation.pipe.js";
import { LeaveRequestsService } from "./leave-requests.service.js";


const REQUEST_ID = new ParseUUIDPipe({ exceptionFactory: () => new NotFoundException("Pengajuan tidak ditemukan") });
// Persetujuan pengajuan izin/sakit/cuti (feature 15, /attendance/requests): owner/admin semua, atasan bawahan langsung.
// Peran & cakupan dibaca ulang dari DB di service.
@Controller("attendance/leave-requests")
export class LeaveRequestsController {
  constructor(private readonly leaveRequests: LeaveRequestsService) {}

  @Get()
  @Roles("owner", "admin", "atasan")
  async list(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(leaveRequestListQuerySchema)) query: LeaveRequestListQuery,
  ): Promise<ApiResponse<LeaveRequestList>> {
    return { success: true, data: await this.leaveRequests.list(user, query) };
  }

  @Post(":id/decision")
  @Roles("owner", "admin", "atasan")
  @HttpCode(HttpStatus.OK)
  async decide(
    @CurrentUser() user: AuthUser,
    @Param("id", REQUEST_ID) id: string,
    @Body(new ZodValidationPipe(leaveDecisionSchema)) body: LeaveDecisionData,
  ): Promise<ApiResponse<null>> {
    await this.leaveRequests.decide(user, id, body);
    return { success: true, data: null };
  }

  // Semua peran: pemilik pengajuan boleh membuka lampirannya sendiri (dicek service)
  @Get(":id/attachment")
  @Roles(...MEMBERSHIP_ROLES)
  async attachment(@CurrentUser() user: AuthUser, @Param("id", REQUEST_ID) id: string): Promise<StreamableFile> {
    const file = await this.leaveRequests.attachment(user, id);
    return new StreamableFile(file.buffer, {
      type: file.contentType,
      disposition: `inline; filename="lampiran"; filename*=UTF-8''${encodeURIComponent(file.name)}`,
      length: file.buffer.length,
    });
  }
}

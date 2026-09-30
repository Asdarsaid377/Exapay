import {
  type ApiResponse,
  LEAVE_ATTACHMENT_MAX_BYTES,
  type LeaveRequest,
  type LeaveRequestInput,
  leaveRequestInputSchema,
  MEMBERSHIP_ROLES,
  type MyLeaveRequests,
  type MyLeaveRequestsQuery,
  myLeaveRequestsQuerySchema,
} from "@exapay/shared";
import { Body, Controller, Get, HttpCode, HttpStatus, NotFoundException, Param, ParseUUIDPipe, Post, Query, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";

import type { AuthUser } from "../../common/auth/auth-user.js";
import { CurrentUser } from "../../common/auth/current-user.decorator.js";
import { Roles } from "../../common/auth/roles.decorator.js";
import { ZodValidationPipe } from "../../common/validation/zod-validation.pipe.js";
import { LeaveRequestsService, type UploadedAttachment } from "./leave-requests.service.js";


const REQUEST_ID = new ParseUUIDPipe({ exceptionFactory: () => new NotFoundException("Pengajuan tidak ditemukan") });
// Lampiran disimpan di memori lalu diteruskan ke storage S3; batas ukuran di multer (413)
const upload = FileInterceptor("attachment", { limits: { fileSize: LEAVE_ATTACHMENT_MAX_BYTES, files: 1 } });

// Pengajuan izin/sakit/cuti milik sendiri (feature 15, portal /me/attendance). Semua peran; syaratnya akun tertaut data karyawan aktif.
@Controller("attendance/me/leave-requests")
@Roles(...MEMBERSHIP_ROLES)
export class MyLeaveRequestsController {
  constructor(private readonly leaveRequests: LeaveRequestsService) {}

  @Get()
  async mine(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(myLeaveRequestsQuerySchema)) query: MyLeaveRequestsQuery,
  ): Promise<ApiResponse<MyLeaveRequests>> {
    return { success: true, data: await this.leaveRequests.mine(user, query.month) };
  }

  // multipart/form-data: type, startDate, endDate, reason (+ attachment opsional)
  @Post()
  @UseInterceptors(upload)
  async create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(leaveRequestInputSchema)) body: LeaveRequestInput,
    @UploadedFile() file: UploadedAttachment | undefined,
  ): Promise<ApiResponse<LeaveRequest>> {
    return { success: true, data: await this.leaveRequests.create(user, body, file ?? null) };
  }

  @Post(":id/cancel")
  @HttpCode(HttpStatus.OK)
  async cancel(@CurrentUser() user: AuthUser, @Param("id", REQUEST_ID) id: string): Promise<ApiResponse<null>> {
    await this.leaveRequests.cancel(user, id);
    return { success: true, data: null };
  }
}

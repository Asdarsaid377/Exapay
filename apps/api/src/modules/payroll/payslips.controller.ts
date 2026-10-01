import { type ApiResponse, type PayslipRun, type PublishPayslipsResult } from "@exapay/shared";
import { Controller, Get, HttpCode, HttpStatus, NotFoundException, Param, ParseUUIDPipe, Post, StreamableFile } from "@nestjs/common";

import type { AuthUser } from "../../common/auth/auth-user.js";
import { CurrentUser } from "../../common/auth/current-user.decorator.js";
import { Roles } from "../../common/auth/roles.decorator.js";
import { type PayslipFile, PayslipsService } from "./payslips.service.js";

const RUN_ID = new ParseUUIDPipe({ exceptionFactory: () => new NotFoundException("Periode payroll tidak ditemukan") });
const PAYSLIP_ID = new ParseUUIDPipe({ exceptionFactory: () => new NotFoundException("Slip gaji tidak ditemukan") });

export function payslipStream(file: PayslipFile): StreamableFile {
  return new StreamableFile(file.buffer, {
    type: "application/pdf",
    disposition: `inline; filename="${file.fileName}"`,
    length: file.buffer.length,
  });
}

// Slip gaji satu periode final (feature 31) — owner/admin (peran dibaca ulang di service): status pembuatan PDF,
// proses ulang, terbitkan (+ email tautan), kirim ulang email, buka PDF.
@Controller("payroll/runs/:id/slips")
@Roles("owner", "admin")
export class PayslipsController {
  constructor(private readonly payslips: PayslipsService) {}

  @Get()
  async list(@CurrentUser() user: AuthUser, @Param("id", RUN_ID) id: string): Promise<ApiResponse<PayslipRun>> {
    return { success: true, data: await this.payslips.list(user, id) };
  }

  @Post("retry")
  @HttpCode(HttpStatus.OK)
  async retry(@CurrentUser() user: AuthUser, @Param("id", RUN_ID) id: string): Promise<ApiResponse<{ queued: number }>> {
    return { success: true, data: await this.payslips.retry(user, id) };
  }

  @Post("publish")
  @HttpCode(HttpStatus.OK)
  async publish(@CurrentUser() user: AuthUser, @Param("id", RUN_ID) id: string): Promise<ApiResponse<PublishPayslipsResult>> {
    return { success: true, data: await this.payslips.publish(user, id) };
  }

  @Post(":payslipId/email")
  @HttpCode(HttpStatus.OK)
  async resendEmail(
    @CurrentUser() user: AuthUser,
    @Param("id", RUN_ID) id: string,
    @Param("payslipId", PAYSLIP_ID) payslipId: string,
  ): Promise<ApiResponse<null>> {
    await this.payslips.resendEmail(user, id, payslipId);
    return { success: true, data: null };
  }

  @Get(":payslipId/pdf")
  async pdf(@CurrentUser() user: AuthUser, @Param("id", RUN_ID) id: string, @Param("payslipId", PAYSLIP_ID) payslipId: string): Promise<StreamableFile> {
    return payslipStream(await this.payslips.file(user, id, payslipId));
  }
}

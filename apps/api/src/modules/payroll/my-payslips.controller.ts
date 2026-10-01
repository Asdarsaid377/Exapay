import { type ApiResponse, MEMBERSHIP_ROLES, type MyPayslipList } from "@exapay/shared";
import { Controller, Get, NotFoundException, Param, ParseUUIDPipe, StreamableFile } from "@nestjs/common";

import type { AuthUser } from "../../common/auth/auth-user.js";
import { CurrentUser } from "../../common/auth/current-user.decorator.js";
import { Roles } from "../../common/auth/roles.decorator.js";
import { payslipStream } from "./payslips.controller.js";
import { PayslipsService } from "./payslips.service.js";

const PAYSLIP_ID = new ParseUUIDPipe({ exceptionFactory: () => new NotFoundException("Slip gaji tidak ditemukan") });

// Slip gaji milik sendiri (portal karyawan /me/payslips, feature 31): hanya slip yang sudah diterbitkan.
@Controller("payroll/me/payslips")
@Roles(...MEMBERSHIP_ROLES)
export class MyPayslipsController {
  constructor(private readonly payslips: PayslipsService) {}

  @Get()
  async list(@CurrentUser() user: AuthUser): Promise<ApiResponse<MyPayslipList>> {
    return { success: true, data: await this.payslips.myList(user) };
  }

  @Get(":payslipId/pdf")
  async pdf(@CurrentUser() user: AuthUser, @Param("payslipId", PAYSLIP_ID) payslipId: string): Promise<StreamableFile> {
    return payslipStream(await this.payslips.myFile(user, payslipId));
  }
}

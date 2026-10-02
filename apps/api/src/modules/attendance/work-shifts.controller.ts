import { type ApiResponse, type WorkShift, type WorkShiftInput, workShiftInputSchema, type WorkShiftList } from "@exapay/shared";
import { Body, Controller, Delete, Get, HttpCode, HttpStatus, NotFoundException, Param, ParseUUIDPipe, Post, Put } from "@nestjs/common";

import type { AuthUser } from "../../common/auth/auth-user.js";
import { CurrentUser } from "../../common/auth/current-user.decorator.js";
import { Roles } from "../../common/auth/roles.decorator.js";
import { ZodValidationPipe } from "../../common/validation/zod-validation.pipe.js";
import { WorkShiftsService } from "./work-shifts.service.js";

const SHIFT_ID = new ParseUUIDPipe({ exceptionFactory: () => new NotFoundException("Shift tidak ditemukan") });

// Master shift (feature 46): daftar untuk semua staf (pemilih shift di roster), kelola owner/admin — peran dibaca ulang di service.
@Controller("attendance/shifts")
export class WorkShiftsController {
  constructor(private readonly shifts: WorkShiftsService) {}

  @Get()
  @Roles("owner", "admin", "atasan")
  async list(@CurrentUser() user: AuthUser): Promise<ApiResponse<WorkShiftList>> {
    return { success: true, data: await this.shifts.list(user) };
  }

  @Post()
  @Roles("owner", "admin")
  async create(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(workShiftInputSchema)) body: WorkShiftInput): Promise<ApiResponse<WorkShift>> {
    return { success: true, data: await this.shifts.create(user, body) };
  }

  @Put(":id")
  @Roles("owner", "admin")
  async update(
    @CurrentUser() user: AuthUser,
    @Param("id", SHIFT_ID) id: string,
    @Body(new ZodValidationPipe(workShiftInputSchema)) body: WorkShiftInput,
  ): Promise<ApiResponse<WorkShift>> {
    return { success: true, data: await this.shifts.update(user, id, body) };
  }

  @Delete(":id")
  @Roles("owner", "admin")
  @HttpCode(HttpStatus.OK)
  async remove(@CurrentUser() user: AuthUser, @Param("id", SHIFT_ID) id: string): Promise<ApiResponse<null>> {
    await this.shifts.remove(user, id);
    return { success: true, data: null };
  }
}

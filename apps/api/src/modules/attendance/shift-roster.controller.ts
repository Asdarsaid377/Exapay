import {
  type ApiResponse,
  isoDateSchema,
  type RosterCell,
  type RosterCellInput,
  rosterCellInputSchema,
  type RosterCopyData,
  rosterCopyInputSchema,
  type RosterCopyResult,
  type RosterQuery,
  rosterQuerySchema,
  type RosterWeek,
} from "@exapay/shared";
import { Body, Controller, Get, HttpCode, HttpStatus, NotFoundException, Param, ParseUUIDPipe, type PipeTransform, Post, Put, Query } from "@nestjs/common";

import type { AuthUser } from "../../common/auth/auth-user.js";
import { CurrentUser } from "../../common/auth/current-user.decorator.js";
import { Roles } from "../../common/auth/roles.decorator.js";
import { ZodValidationPipe } from "../../common/validation/zod-validation.pipe.js";
import { ShiftRosterService } from "./shift-roster.service.js";

const EMPLOYEE_ID = new ParseUUIDPipe({ exceptionFactory: () => new NotFoundException("Karyawan tidak ditemukan") });

class IsoDatePipe implements PipeTransform<string, string> {
  transform(value: string): string {
    if (!isoDateSchema.safeParse(value).success) throw new NotFoundException("Tanggal tidak valid");
    return value;
  }
}

// Roster shift (feature 46, /attendance/roster): owner/admin semua karyawan, atasan bawahan langsung — cakupan dicek service.
@Controller("attendance/roster")
@Roles("owner", "admin", "atasan")
export class ShiftRosterController {
  constructor(private readonly roster: ShiftRosterService) {}

  @Get()
  async week(@CurrentUser() user: AuthUser, @Query(new ZodValidationPipe(rosterQuerySchema)) query: RosterQuery): Promise<ApiResponse<RosterWeek>> {
    return { success: true, data: await this.roster.week(user, query) };
  }

  // Satu sel: shift / libur / kosongkan
  @Put(":employeeId/:date")
  async setCell(
    @CurrentUser() user: AuthUser,
    @Param("employeeId", EMPLOYEE_ID) employeeId: string,
    @Param("date", new IsoDatePipe()) date: string,
    @Body(new ZodValidationPipe(rosterCellInputSchema)) body: RosterCellInput,
  ): Promise<ApiResponse<RosterCell>> {
    return { success: true, data: await this.roster.setCell(user, employeeId, date, body) };
  }

  // Salin minggu lalu (dryRun → hanya hitung untuk dialog konfirmasi)
  @Post("copy-previous-week")
  @HttpCode(HttpStatus.OK)
  async copy(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(rosterCopyInputSchema)) body: RosterCopyData): Promise<ApiResponse<RosterCopyResult>> {
    return { success: true, data: await this.roster.copyPreviousWeek(user, body) };
  }
}

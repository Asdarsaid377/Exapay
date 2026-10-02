import { type AttendanceEvent, MEMBERSHIP_ROLES } from "@exapay/shared";
import { Controller, Get, NotFoundException, Param, ParseUUIDPipe, StreamableFile } from "@nestjs/common";

import type { AuthUser } from "../../common/auth/auth-user.js";
import { CurrentUser } from "../../common/auth/current-user.decorator.js";
import { Roles } from "../../common/auth/roles.decorator.js";
import { AttendanceEventPipe } from "./attendance-reviews.controller.js";
import { AttendanceService } from "./attendance.service.js";

const RECORD_ID = new ParseUUIDPipe({ exceptionFactory: () => new NotFoundException("Foto selfie tidak ditemukan") });

// Selfie absen (feature 45): pemilik absen, atasan langsungnya, owner/admin (dicek service).
// Dipakai portal, rekap/koreksi absensi, dan antrean tinjauan.
@Controller("attendance/records")
export class AttendanceSelfiesController {
  constructor(private readonly attendance: AttendanceService) {}

  @Get(":id/selfie/:event")
  @Roles(...MEMBERSHIP_ROLES)
  async selfie(
    @CurrentUser() user: AuthUser,
    @Param("id", RECORD_ID) id: string,
    @Param("event", new AttendanceEventPipe()) event: AttendanceEvent,
  ): Promise<StreamableFile> {
    const file = await this.attendance.selfie(user, id, event);
    return new StreamableFile(file.buffer, { type: file.contentType, disposition: "inline", length: file.buffer.length });
  }
}

import {
  ATTENDANCE_EVENTS,
  type ApiResponse,
  type AttendanceEvent,
  type AttendanceReviewDecisionData,
  attendanceReviewDecisionSchema,
  type AttendanceReviewList,
  type AttendanceReviewListQuery,
  attendanceReviewListQuerySchema,
} from "@exapay/shared";
import { Body, Controller, Get, NotFoundException, Param, ParseUUIDPipe, type PipeTransform, Put, Query } from "@nestjs/common";

import type { AuthUser } from "../../common/auth/auth-user.js";
import { CurrentUser } from "../../common/auth/current-user.decorator.js";
import { Roles } from "../../common/auth/roles.decorator.js";
import { ZodValidationPipe } from "../../common/validation/zod-validation.pipe.js";
import { AttendanceReviewsService } from "./attendance-reviews.service.js";

const RECORD_ID = new ParseUUIDPipe({ exceptionFactory: () => new NotFoundException("Absen tidak ditemukan") });

class AttendanceEventPipe implements PipeTransform<string, AttendanceEvent> {
  transform(value: string): AttendanceEvent {
    const event = ATTENDANCE_EVENTS.find((e) => e === value);
    if (!event) throw new NotFoundException("Absen tidak ditemukan");
    return event;
  }
}

// Antrean tinjauan absen bertanda (feature 44, /attendance/review): owner/admin semua, atasan bawahan langsung.
// Peran & cakupan dibaca ulang dari DB di service.
@Controller("attendance/reviews")
@Roles("owner", "admin", "atasan")
export class AttendanceReviewsController {
  constructor(private readonly reviews: AttendanceReviewsService) {}

  @Get()
  async list(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(attendanceReviewListQuerySchema)) query: AttendanceReviewListQuery,
  ): Promise<ApiResponse<AttendanceReviewList>> {
    return { success: true, data: await this.reviews.list(user, query) };
  }

  // Satu keputusan per absen masuk/pulang; dikirim ulang = keputusan diubah
  @Put(":recordId/:event")
  async decide(
    @CurrentUser() user: AuthUser,
    @Param("recordId", RECORD_ID) recordId: string,
    @Param("event", new AttendanceEventPipe()) event: AttendanceEvent,
    @Body(new ZodValidationPipe(attendanceReviewDecisionSchema)) body: AttendanceReviewDecisionData,
  ): Promise<ApiResponse<null>> {
    await this.reviews.decide(user, recordId, event, body);
    return { success: true, data: null };
  }
}

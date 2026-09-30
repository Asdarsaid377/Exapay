import { MEMBERSHIP_ROLES } from "@exapay/shared";
import { Controller, Get, NotFoundException, Param, ParseUUIDPipe, StreamableFile } from "@nestjs/common";

import type { AuthUser } from "../../common/auth/auth-user.js";
import { CurrentUser } from "../../common/auth/current-user.decorator.js";
import { Roles } from "../../common/auth/roles.decorator.js";
import { TaskLogsService } from "./task-logs.service.js";

const LOG_ID = new ParseUUIDPipe({ exceptionFactory: () => new NotFoundException("Catatan tugas tidak ditemukan") });

// Foto bukti log tugas: pemilik catatan, atasan langsungnya, owner/admin (dicek service). Dipakai portal & verifikasi (feature 20).
@Controller("tasks/logs")
export class TaskLogsController {
  constructor(private readonly taskLogs: TaskLogsService) {}

  @Get(":id/photo")
  @Roles(...MEMBERSHIP_ROLES)
  async photo(@CurrentUser() user: AuthUser, @Param("id", LOG_ID) id: string): Promise<StreamableFile> {
    const file = await this.taskLogs.photo(user, id);
    return new StreamableFile(file.buffer, { type: file.contentType, disposition: "inline", length: file.buffer.length });
  }
}

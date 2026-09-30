import {
  type ApiResponse,
  MEMBERSHIP_ROLES,
  type MyTaskDay,
  type MyTaskDayQuery,
  myTaskDayQuerySchema,
  TASK_PHOTO_MAX_BYTES,
  type TaskLog,
  type TaskLogInput,
  taskLogInputSchema,
  type TaskLogUpdateInput,
  taskLogUpdateSchema,
} from "@exapay/shared";
import { Body, Controller, Delete, Get, NotFoundException, Param, ParseUUIDPipe, Post, Put, Query, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";

import type { AuthUser } from "../../common/auth/auth-user.js";
import { CurrentUser } from "../../common/auth/current-user.decorator.js";
import { Roles } from "../../common/auth/roles.decorator.js";
import { ZodValidationPipe } from "../../common/validation/zod-validation.pipe.js";
import { TaskLogsService, type UploadedPhoto } from "./task-logs.service.js";

const LOG_ID = new ParseUUIDPipe({ exceptionFactory: () => new NotFoundException("Catatan tugas tidak ditemukan") });
// Foto disimpan di memori lalu diteruskan ke storage S3; batas ukuran di multer (413)
const upload = FileInterceptor("photo", { limits: { fileSize: TASK_PHOTO_MAX_BYTES, files: 1 } });

// Log tugas harian milik sendiri (feature 19, portal /me/tasks). Semua peran; syaratnya akun tertaut data karyawan aktif.
@Controller("tasks/me")
@Roles(...MEMBERSHIP_ROLES)
export class MyTaskLogsController {
  constructor(private readonly taskLogs: TaskLogsService) {}

  @Get()
  async day(@CurrentUser() user: AuthUser, @Query(new ZodValidationPipe(myTaskDayQuerySchema)) query: MyTaskDayQuery): Promise<ApiResponse<MyTaskDay>> {
    return { success: true, data: await this.taskLogs.myDay(user, query.date) };
  }

  // multipart/form-data: workDate, indicatorId, quantity, note (+ photo opsional)
  @Post("logs")
  @UseInterceptors(upload)
  async create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(taskLogInputSchema)) body: TaskLogInput,
    @UploadedFile() file: UploadedPhoto | undefined,
  ): Promise<ApiResponse<TaskLog>> {
    return { success: true, data: await this.taskLogs.create(user, body, file ?? null) };
  }

  // multipart/form-data: indicatorId, quantity, note, removePhoto (+ photo pengganti opsional)
  @Put("logs/:id")
  @UseInterceptors(upload)
  async update(
    @CurrentUser() user: AuthUser,
    @Param("id", LOG_ID) id: string,
    @Body(new ZodValidationPipe(taskLogUpdateSchema)) body: TaskLogUpdateInput,
    @UploadedFile() file: UploadedPhoto | undefined,
  ): Promise<ApiResponse<TaskLog>> {
    return { success: true, data: await this.taskLogs.update(user, id, body, file ?? null) };
  }

  @Delete("logs/:id")
  async remove(@CurrentUser() user: AuthUser, @Param("id", LOG_ID) id: string): Promise<ApiResponse<null>> {
    await this.taskLogs.remove(user, id);
    return { success: true, data: null };
  }
}

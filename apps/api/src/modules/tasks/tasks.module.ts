import { Module } from "@nestjs/common";

import { AttendanceModule } from "../attendance/attendance.module.js";
import { MyTaskLogsController } from "./my-task-logs.controller.js";
import { TaskLogsController } from "./task-logs.controller.js";
import { TaskLogsService } from "./task-logs.service.js";
import { TaskVerificationController } from "./task-verification.controller.js";
import { TaskVerificationService } from "./task-verification.service.js";

// Tugas harian (phase 4): log tugas karyawan (feature 19), verifikasi atasan (feature 20). Memakai AttendanceService (zona waktu usaha, data karyawan sendiri).
@Module({
  imports: [AttendanceModule],
  controllers: [MyTaskLogsController, TaskLogsController, TaskVerificationController],
  providers: [TaskLogsService, TaskVerificationService],
})
export class TasksModule {}

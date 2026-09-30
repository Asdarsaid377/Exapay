import { Module } from "@nestjs/common";

import { AttendanceSettingsController } from "./attendance-settings.controller.js";
import { AttendanceService } from "./attendance.service.js";
import { MyAttendanceController } from "./my-attendance.controller.js";
import { WorkCalendarService } from "./work-calendar.service.js";

// Absensi (phase 3). WorkCalendarService diekspor untuk hitung hari kerja di KPI & payroll.
@Module({
  controllers: [AttendanceSettingsController, MyAttendanceController],
  providers: [WorkCalendarService, AttendanceService],
  exports: [WorkCalendarService],
})
export class AttendanceModule {}

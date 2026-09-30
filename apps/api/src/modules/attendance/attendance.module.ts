import { Module } from "@nestjs/common";

import { AttendanceSettingsController } from "./attendance-settings.controller.js";
import { AttendanceService } from "./attendance.service.js";
import { LeaveRequestsController } from "./leave-requests.controller.js";
import { LeaveRequestsService } from "./leave-requests.service.js";
import { MyLeaveRequestsController } from "./my-leave-requests.controller.js";
import { MyAttendanceController } from "./my-attendance.controller.js";
import { WorkCalendarService } from "./work-calendar.service.js";

// Absensi (phase 3): jadwal & libur, absen masuk/pulang, pengajuan izin/sakit/cuti (feature 15). WorkCalendarService diekspor untuk hitung hari kerja di KPI & payroll.
@Module({
  controllers: [AttendanceSettingsController, MyAttendanceController, MyLeaveRequestsController, LeaveRequestsController],
  providers: [WorkCalendarService, AttendanceService, LeaveRequestsService],
  exports: [WorkCalendarService],
})
export class AttendanceModule {}

import { Module } from "@nestjs/common";

import { AttendanceCorrectionsController } from "./attendance-corrections.controller.js";
import { AttendanceCorrectionsService } from "./attendance-corrections.service.js";
import { AttendanceDeductionRulesController } from "./attendance-deduction-rules.controller.js";
import { AttendanceDeductionRulesService } from "./attendance-deduction-rules.service.js";
import { AttendanceRecapController } from "./attendance-recap.controller.js";
import { AttendanceRecapService } from "./attendance-recap.service.js";
import { AttendanceSettingsController } from "./attendance-settings.controller.js";
import { AttendanceService } from "./attendance.service.js";
import { LeaveRequestsController } from "./leave-requests.controller.js";
import { LeaveRequestsService } from "./leave-requests.service.js";
import { MyLeaveRequestsController } from "./my-leave-requests.controller.js";
import { MyAttendanceController } from "./my-attendance.controller.js";
import { WorkCalendarService } from "./work-calendar.service.js";

// Absensi (phase 3): jadwal & libur, absen masuk/pulang, pengajuan izin/sakit/cuti (feature 15), rekap & koreksi (feature 16), aturan potongan (feature 17). WorkCalendarService diekspor untuk hitung hari kerja di KPI & payroll; AttendanceService untuk log tugas (feature 19).
@Module({
  controllers: [
    AttendanceSettingsController,
    MyAttendanceController,
    MyLeaveRequestsController,
    LeaveRequestsController,
    AttendanceRecapController,
    AttendanceCorrectionsController,
    AttendanceDeductionRulesController,
  ],
  providers: [WorkCalendarService, AttendanceService, LeaveRequestsService, AttendanceRecapService, AttendanceCorrectionsService, AttendanceDeductionRulesService],
  exports: [WorkCalendarService, AttendanceService],
})
export class AttendanceModule {}

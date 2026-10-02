import { Module } from "@nestjs/common";

import { AttendanceCorrectionsController } from "./attendance-corrections.controller.js";
import { AttendanceCorrectionsService } from "./attendance-corrections.service.js";
import { AttendanceDeductionRulesController } from "./attendance-deduction-rules.controller.js";
import { AttendanceDeductionRulesService } from "./attendance-deduction-rules.service.js";
import { AttendancePeriodsService } from "./attendance-periods.service.js";
import { AttendanceRecapController } from "./attendance-recap.controller.js";
import { AttendanceRecapService } from "./attendance-recap.service.js";
import { AttendanceReviewsController } from "./attendance-reviews.controller.js";
import { AttendanceReviewsService } from "./attendance-reviews.service.js";
import { AttendanceSelfiesController } from "./attendance-selfies.controller.js";
import { AttendanceSettingsController } from "./attendance-settings.controller.js";
import { AttendanceService } from "./attendance.service.js";
import { EmployeeAttendanceSettingsController } from "./employee-attendance-settings.controller.js";
import { LeaveRequestsController } from "./leave-requests.controller.js";
import { LeaveRequestsService } from "./leave-requests.service.js";
import { MyLeaveRequestsController } from "./my-leave-requests.controller.js";
import { MyAttendanceController } from "./my-attendance.controller.js";
import { ShiftRosterController } from "./shift-roster.controller.js";
import { ShiftRosterService } from "./shift-roster.service.js";
import { WorkCalendarService } from "./work-calendar.service.js";
import { WorkLocationsController } from "./work-locations.controller.js";
import { WorkLocationsService } from "./work-locations.service.js";
import { WorkShiftsController } from "./work-shifts.controller.js";
import { WorkShiftsService } from "./work-shifts.service.js";

// Absensi (phase 3): jadwal & libur, absen masuk/pulang, pengajuan izin/sakit/cuti (feature 15), rekap & koreksi (feature 16), aturan potongan (feature 17). WorkCalendarService diekspor untuk hitung hari kerja di KPI & payroll; AttendanceService untuk log tugas (feature 19); AttendanceRecapService untuk skor KPI (feature 21); AttendanceDeductionRulesService untuk input absensi payroll (feature 27/29); AttendancePeriodsService untuk periode tutup buku (feature 30b). Lokasi kerja & tinjauan absen bertanda (feature 44). Selfie absen (feature 45). Master shift & roster (feature 46).
@Module({
	controllers: [
		AttendanceSettingsController,
		MyAttendanceController,
		MyLeaveRequestsController,
		LeaveRequestsController,
		AttendanceRecapController,
		AttendanceCorrectionsController,
		AttendanceDeductionRulesController,
		WorkLocationsController,
		EmployeeAttendanceSettingsController,
		AttendanceReviewsController,
		AttendanceSelfiesController,
		WorkShiftsController,
		ShiftRosterController,
	],
	providers: [
		WorkCalendarService,
		AttendanceService,
		AttendancePeriodsService,
		LeaveRequestsService,
		AttendanceRecapService,
		AttendanceCorrectionsService,
		AttendanceDeductionRulesService,
		WorkLocationsService,
		AttendanceReviewsService,
		ShiftRosterService,
		WorkShiftsService,
	],
	exports: [
		WorkCalendarService,
		AttendanceService,
		AttendancePeriodsService,
		AttendanceRecapService,
		AttendanceDeductionRulesService,
	],
})
export class AttendanceModule {}

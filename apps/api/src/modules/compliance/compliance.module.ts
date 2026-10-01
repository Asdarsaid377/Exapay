import { Module } from "@nestjs/common";

import { AttendanceModule } from "../attendance/attendance.module.js";
import { PayrollModule } from "../payroll/payroll.module.js";
import { ComplianceController } from "./compliance.controller.js";
import { ComplianceService } from "./compliance.service.js";

// Kalender kepatuhan (feature 33): halaman /compliance (+ peringatan upah minimum, feature 34). Email H-7/H-1 dikirim job terjadwal apps/worker (antrean "compliance").
@Module({
  imports: [AttendanceModule, PayrollModule],
  controllers: [ComplianceController],
  providers: [ComplianceService],
  exports: [ComplianceService],
})
export class ComplianceModule {}

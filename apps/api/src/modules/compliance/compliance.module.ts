import { Module } from "@nestjs/common";

import { AttendanceModule } from "../attendance/attendance.module.js";
import { ComplianceController } from "./compliance.controller.js";
import { ComplianceService } from "./compliance.service.js";

// Kalender kepatuhan (feature 33): halaman /compliance. Email H-7/H-1 dikirim job terjadwal apps/worker (antrean "compliance").
@Module({
  imports: [AttendanceModule],
  controllers: [ComplianceController],
  providers: [ComplianceService],
})
export class ComplianceModule {}

import { Module } from "@nestjs/common";

import { AttendanceModule } from "../attendance/attendance.module.js";
import { ComplianceModule } from "../compliance/compliance.module.js";
import { KpiModule } from "../kpi/kpi.module.js";
import { PayrollModule } from "../payroll/payroll.module.js";
import { DashboardController } from "./dashboard.controller.js";
import { DashboardService } from "./dashboard.service.js";

// Dashboard (feature 35): ringkasan dari service modul sumber — tanpa tabel sendiri
@Module({
  imports: [AttendanceModule, KpiModule, PayrollModule, ComplianceModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}

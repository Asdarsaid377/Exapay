import { Module } from "@nestjs/common";

import { AttendanceModule } from "../attendance/attendance.module.js";
import { RegulationsModule } from "../regulations/regulations.module.js";
import { EmployeeSalariesController } from "./employee-salaries.controller.js";
import { EmployeeSalariesService } from "./employee-salaries.service.js";
import { PayrollRunsController } from "./payroll-runs.controller.js";
import { PayrollRunsService } from "./payroll-runs.service.js";
import { SalaryComponentsController } from "./salary-components.controller.js";
import { SalaryComponentsService } from "./salary-components.service.js";

// Payroll (phase 6): katalog komponen gaji & gaji karyawan berlaku-tanggal (feature 28), run payroll draf & review
// (feature 29). Perhitungan di payroll-engine.
@Module({
  imports: [AttendanceModule, RegulationsModule],
  controllers: [SalaryComponentsController, EmployeeSalariesController, PayrollRunsController],
  providers: [SalaryComponentsService, EmployeeSalariesService, PayrollRunsService],
})
export class PayrollModule {}

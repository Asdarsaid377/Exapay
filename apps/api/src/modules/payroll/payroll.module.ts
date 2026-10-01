import { Module } from "@nestjs/common";

import { AttendanceModule } from "../attendance/attendance.module.js";
import { EmployeeSalariesController } from "./employee-salaries.controller.js";
import { EmployeeSalariesService } from "./employee-salaries.service.js";
import { SalaryComponentsController } from "./salary-components.controller.js";
import { SalaryComponentsService } from "./salary-components.service.js";

// Payroll (phase 6): katalog komponen gaji & gaji karyawan berlaku-tanggal (feature 28). Perhitungan di payroll-engine.
@Module({
  imports: [AttendanceModule],
  controllers: [SalaryComponentsController, EmployeeSalariesController],
  providers: [SalaryComponentsService, EmployeeSalariesService],
})
export class PayrollModule {}

import { Module } from "@nestjs/common";

import { AttendanceModule } from "../attendance/attendance.module.js";
import { PayrollModule } from "../payroll/payroll.module.js";
import { EmployeeImportController } from "./employee-import.controller.js";
import { EmployeeImportService } from "./employee-import.service.js";
import { EmployeesController } from "./employees.controller.js";
import { EmployeesService } from "./employees.service.js";
import { MyEmployeeController } from "./my-employee.controller.js";

@Module({
  imports: [AttendanceModule, PayrollModule],
  // EmployeeImportController & MyEmployeeController lebih dulu: /employees/import/template dan /employees/me tidak boleh
  // tertangkap GET /employees/:id
  controllers: [EmployeeImportController, MyEmployeeController, EmployeesController],
  providers: [EmployeesService, EmployeeImportService],
})
export class EmployeesModule {}

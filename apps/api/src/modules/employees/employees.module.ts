import { Module } from "@nestjs/common";

import { EmployeeImportController } from "./employee-import.controller.js";
import { EmployeeImportService } from "./employee-import.service.js";
import { EmployeesController } from "./employees.controller.js";
import { EmployeesService } from "./employees.service.js";

@Module({
  // EmployeeImportController lebih dulu: /employees/import/template tidak boleh tertangkap GET /employees/:id
  controllers: [EmployeeImportController, EmployeesController],
  providers: [EmployeesService, EmployeeImportService],
})
export class EmployeesModule {}

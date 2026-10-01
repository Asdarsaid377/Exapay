import { Module } from "@nestjs/common";

import { AttendanceModule } from "../attendance/attendance.module.js";
import { RegulationsModule } from "../regulations/regulations.module.js";
import { EmployeeSalariesController } from "./employee-salaries.controller.js";
import { EmployeeSalariesService } from "./employee-salaries.service.js";
import { MinimumWageService } from "./minimum-wage.service.js";
import { MyPayslipsController } from "./my-payslips.controller.js";
import { PayrollReportsController } from "./payroll-reports.controller.js";
import { PayrollReportsService } from "./payroll-reports.service.js";
import { PayrollRunsController } from "./payroll-runs.controller.js";
import { PayrollRunsService } from "./payroll-runs.service.js";
import { PayslipsController } from "./payslips.controller.js";
import { PayslipsService } from "./payslips.service.js";
import { SalaryComponentsController } from "./salary-components.controller.js";
import { SalaryComponentsService } from "./salary-components.service.js";

// Payroll (phase 6): katalog komponen gaji & gaji karyawan berlaku-tanggal (feature 28), run payroll draf & review
// (feature 29), finalisasi (feature 30), slip gaji PDF (feature 31 — PDF & email dibuat apps/worker),
// laporan & ekspor Excel (feature 32). Perhitungan di payroll-engine. MinimumWageService (peringatan UMK, feature 34)
// diekspor untuk daftar karyawan & kalender kepatuhan.
@Module({
  imports: [AttendanceModule, RegulationsModule],
  controllers: [SalaryComponentsController, EmployeeSalariesController, PayrollRunsController, PayslipsController, MyPayslipsController, PayrollReportsController],
  providers: [SalaryComponentsService, EmployeeSalariesService, PayrollRunsService, PayslipsService, PayrollReportsService, MinimumWageService],
  exports: [MinimumWageService, PayrollRunsService],
})
export class PayrollModule {}

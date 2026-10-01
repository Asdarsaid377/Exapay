import { type ApiResponse, type PayrollReport, payrollReportYearSchema } from "@exapay/shared";
import { Controller, Get, NotFoundException, Param, ParseUUIDPipe, Query, StreamableFile } from "@nestjs/common";
import { z } from "zod";

import type { AuthUser } from "../../common/auth/auth-user.js";
import { CurrentUser } from "../../common/auth/current-user.decorator.js";
import { Roles } from "../../common/auth/roles.decorator.js";
import { ZodValidationPipe } from "../../common/validation/zod-validation.pipe.js";
import { PayrollReportsService, type ReportFile } from "./payroll-reports.service.js";

const RUN_ID = new ParseUUIDPipe({ exceptionFactory: () => new NotFoundException("Periode payroll tidak ditemukan") });
const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const reportQuerySchema = z.object({ year: payrollReportYearSchema.optional() });

function xlsx(file: ReportFile): StreamableFile {
  return new StreamableFile(file.buffer, { type: XLSX_TYPE, disposition: `attachment; filename="${file.fileName}"`, length: file.buffer.length });
}

// Laporan & ekspor payroll (feature 32) — owner/admin: rekap periode final per tahun, Excel transfer bank & rekap setor.
@Controller("payroll/reports")
@Roles("owner", "admin")
export class PayrollReportsController {
  constructor(private readonly reports: PayrollReportsService) {}

  @Get()
  async report(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(reportQuerySchema)) query: z.output<typeof reportQuerySchema>,
  ): Promise<ApiResponse<PayrollReport>> {
    return { success: true, data: await this.reports.report(user, query.year ?? null) };
  }

  @Get("runs/:id/transfer")
  async transfer(@CurrentUser() user: AuthUser, @Param("id", RUN_ID) id: string): Promise<StreamableFile> {
    return xlsx(await this.reports.transferFile(user, id));
  }

  @Get("runs/:id/contributions")
  async contributions(@CurrentUser() user: AuthUser, @Param("id", RUN_ID) id: string): Promise<StreamableFile> {
    return xlsx(await this.reports.contributionsFile(user, id));
  }
}

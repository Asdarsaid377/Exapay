import { Controller, Get, HttpCode, HttpStatus, Res } from "@nestjs/common";
import type { ApiResponse } from "@exapay/shared";
import type { Response } from "express";

import { HealthService, type HealthReport } from "./health.service.js";

// Endpoint publik (tanpa auth) — dipakai Docker healthcheck & monitoring.
@Controller("health")
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  async check(@Res({ passthrough: true }) res: Response): Promise<ApiResponse<HealthReport>> {
    const report = await this.healthService.check();
    if (report.status !== "ok") {
      res.status(HttpStatus.SERVICE_UNAVAILABLE);
      return { success: false, error: "Sebagian layanan tidak tersedia", data: report };
    }
    return { success: true, data: report };
  }
}

import { Module } from "@nestjs/common";

import { KpiTemplatesController } from "./kpi-templates.controller.js";
import { KpiTemplatesService } from "./kpi-templates.service.js";

// KPI (phase 4): template per jabatan (feature 18)
@Module({
  controllers: [KpiTemplatesController],
  providers: [KpiTemplatesService],
})
export class KpiModule {}

import { Module } from "@nestjs/common";

import { AttendanceModule } from "../attendance/attendance.module.js";
import { KpiReviewsController } from "./kpi-reviews.controller.js";
import { KpiReviewsService } from "./kpi-reviews.service.js";
import { KpiScoresController } from "./kpi-scores.controller.js";
import { KpiScoresService } from "./kpi-scores.service.js";
import { KpiTemplatesController } from "./kpi-templates.controller.js";
import { KpiTemplatesService } from "./kpi-templates.service.js";

// KPI (phase 4–5): template per jabatan (feature 18), skor ad-hoc (feature 21 — memakai rekap absensi & kalender kerja dari AttendanceModule),
// siklus & penilaian periodik (feature 22 — memakai ulang KpiScoresService)
@Module({
  imports: [AttendanceModule],
  controllers: [KpiTemplatesController, KpiScoresController, KpiReviewsController],
  providers: [KpiTemplatesService, KpiScoresService, KpiReviewsService],
})
export class KpiModule {}

import { Module } from "@nestjs/common";

import { AttendanceModule } from "../attendance/attendance.module.js";
import { KpiReviewSummariesController } from "./kpi-review-summaries.controller.js";
import { KpiReviewSummariesService } from "./kpi-review-summaries.service.js";
import { KpiReviewsController } from "./kpi-reviews.controller.js";
import { KpiReviewsService } from "./kpi-reviews.service.js";
import { KpiScoresController } from "./kpi-scores.controller.js";
import { KpiScoresService } from "./kpi-scores.service.js";
import { KpiTemplatesController } from "./kpi-templates.controller.js";
import { KpiTemplatesService } from "./kpi-templates.service.js";
import { MyKpiReviewsController } from "./my-kpi-reviews.controller.js";

// KPI (phase 4–5): template per jabatan (feature 18), skor ad-hoc (feature 21 — memakai rekap absensi & kalender kerja dari AttendanceModule),
// siklus & penilaian periodik (feature 22 — memakai ulang KpiScoresService), ringkasan AI (feature 23 — antrean AI_QUEUE dari RedisModule global)
@Module({
  imports: [AttendanceModule],
  controllers: [KpiTemplatesController, KpiScoresController, KpiReviewsController, KpiReviewSummariesController, MyKpiReviewsController],
  providers: [KpiTemplatesService, KpiScoresService, KpiReviewsService, KpiReviewSummariesService],
  exports: [KpiScoresService],
})
export class KpiModule {}

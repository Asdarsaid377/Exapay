import { Module } from "@nestjs/common";

import { RegulationsService } from "./regulations.service.js";

// Data regulasi berlaku-tanggal (feature 24) — dipakai payroll (feature 25+) dan peringatan UMK (feature 34). Tanpa endpoint.
@Module({
  providers: [RegulationsService],
  exports: [RegulationsService],
})
export class RegulationsModule {}

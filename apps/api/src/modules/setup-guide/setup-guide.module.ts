import { Module } from "@nestjs/common";

import { SetupGuideController } from "./setup-guide.controller.js";
import { SetupGuideService } from "./setup-guide.service.js";

// Panduan setup awal (feature 48)
@Module({
  controllers: [SetupGuideController],
  providers: [SetupGuideService],
})
export class SetupGuideModule {}

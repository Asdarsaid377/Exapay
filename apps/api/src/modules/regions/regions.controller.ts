import type { ApiResponse, RegionProvince } from "@exapay/shared";
import { Controller, Get } from "@nestjs/common";

import { RegionsService } from "./regions.service.js";

// Provinsi + kabupaten/kota (Kepmendagri). Cukup login — data publik tingkat platform.
@Controller("regions")
export class RegionsController {
  constructor(private readonly regionsService: RegionsService) {}

  @Get()
  async list(): Promise<ApiResponse<RegionProvince[]>> {
    return { success: true, data: await this.regionsService.list() };
  }
}

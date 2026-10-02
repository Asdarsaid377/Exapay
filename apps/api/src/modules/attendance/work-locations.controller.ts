import { type ApiResponse, type WorkLocation, type WorkLocationData, workLocationInputSchema, type WorkLocationOverview } from "@exapay/shared";
import { Body, Controller, Delete, Get, HttpCode, HttpStatus, NotFoundException, Param, ParseUUIDPipe, Post, Put } from "@nestjs/common";

import type { AuthUser } from "../../common/auth/auth-user.js";
import { CurrentUser } from "../../common/auth/current-user.decorator.js";
import { Roles } from "../../common/auth/roles.decorator.js";
import { ZodValidationPipe } from "../../common/validation/zod-validation.pipe.js";
import { WorkLocationsService } from "./work-locations.service.js";

const LOCATION_ID = new ParseUUIDPipe({ exceptionFactory: () => new NotFoundException("Lokasi kerja tidak ditemukan") });

// Lokasi kerja usaha (feature 44, /settings/locations): owner/admin — peran dibaca ulang dari DB di service.
@Controller("attendance/locations")
@Roles("owner", "admin")
export class WorkLocationsController {
  constructor(private readonly workLocations: WorkLocationsService) {}

  @Get()
  async overview(@CurrentUser() user: AuthUser): Promise<ApiResponse<WorkLocationOverview>> {
    return { success: true, data: await this.workLocations.overview(user) };
  }

  @Post()
  async create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(workLocationInputSchema)) body: WorkLocationData,
  ): Promise<ApiResponse<WorkLocation>> {
    return { success: true, data: await this.workLocations.create(user, body) };
  }

  @Put(":id")
  async update(
    @CurrentUser() user: AuthUser,
    @Param("id", LOCATION_ID) id: string,
    @Body(new ZodValidationPipe(workLocationInputSchema)) body: WorkLocationData,
  ): Promise<ApiResponse<WorkLocation>> {
    return { success: true, data: await this.workLocations.update(user, id, body) };
  }

  @Delete(":id")
  @HttpCode(HttpStatus.OK)
  async remove(@CurrentUser() user: AuthUser, @Param("id", LOCATION_ID) id: string): Promise<ApiResponse<null>> {
    await this.workLocations.remove(user, id);
    return { success: true, data: null };
  }
}

import { type ApiResponse, ORG_KINDS, type OrgItem, type OrgItemInput, orgItemSchema, type OrgKind, type Organization } from "@exapay/shared";
import { Body, Controller, Delete, Get, HttpCode, HttpStatus, NotFoundException, Param, ParseUUIDPipe, type PipeTransform, Post, Put } from "@nestjs/common";

import type { AuthUser } from "../../common/auth/auth-user.js";
import { CurrentUser } from "../../common/auth/current-user.decorator.js";
import { Roles } from "../../common/auth/roles.decorator.js";
import { ZodValidationPipe } from "../../common/validation/zod-validation.pipe.js";
import { OrganizationService } from "./organization.service.js";

// :kind = departments | positions. Selain itu 404 (bukan 400 — rute memang tidak ada)
const KIND: PipeTransform<string, OrgKind> = {
  transform(value: string): OrgKind {
    const kind = ORG_KINDS.find((k) => k === value);
    if (!kind) throw new NotFoundException("Halaman tidak ditemukan");
    return kind;
  },
};
const ITEM_ID = new ParseUUIDPipe({ exceptionFactory: () => new NotFoundException("Data tidak ditemukan") });

// Departemen & jabatan (feature 10, /organization). Atasan hanya melihat.
@Controller("organization")
export class OrganizationController {
  constructor(private readonly organizationService: OrganizationService) {}

  @Get()
  @Roles("owner", "admin", "atasan")
  async overview(@CurrentUser() user: AuthUser): Promise<ApiResponse<Organization>> {
    return { success: true, data: await this.organizationService.overview(user) };
  }

  @Post(":kind")
  @Roles("owner", "admin")
  async create(
    @CurrentUser() user: AuthUser,
    @Param("kind", KIND) kind: OrgKind,
    @Body(new ZodValidationPipe(orgItemSchema)) body: OrgItemInput,
  ): Promise<ApiResponse<OrgItem>> {
    return { success: true, data: await this.organizationService.create(user, kind, body) };
  }

  @Put(":kind/:id")
  @Roles("owner", "admin")
  async rename(
    @CurrentUser() user: AuthUser,
    @Param("kind", KIND) kind: OrgKind,
    @Param("id", ITEM_ID) id: string,
    @Body(new ZodValidationPipe(orgItemSchema)) body: OrgItemInput,
  ): Promise<ApiResponse<OrgItem>> {
    return { success: true, data: await this.organizationService.rename(user, kind, id, body) };
  }

  @Delete(":kind/:id")
  @Roles("owner", "admin")
  @HttpCode(HttpStatus.OK)
  async remove(@CurrentUser() user: AuthUser, @Param("kind", KIND) kind: OrgKind, @Param("id", ITEM_ID) id: string): Promise<ApiResponse<null>> {
    await this.organizationService.remove(user, kind, id);
    return { success: true, data: null };
  }
}

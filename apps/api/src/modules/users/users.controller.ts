import {
  type ApiResponse,
  type ChangeMemberRoleInput,
  changeMemberRoleSchema,
  type InviteUserInput,
  inviteUserSchema,
  type TenantUsersOverview,
} from "@exapay/shared";
import { Body, Controller, Get, HttpCode, HttpStatus, NotFoundException, Param, ParseUUIDPipe, Post } from "@nestjs/common";

import type { AuthUser } from "../../common/auth/auth-user.js";
import { CurrentUser } from "../../common/auth/current-user.decorator.js";
import { Roles } from "../../common/auth/roles.decorator.js";
import { ZodValidationPipe } from "../../common/validation/zod-validation.pipe.js";
import { UsersService } from "./users.service.js";

// Id bukan UUID → diperlakukan sama dengan data yang tidak ada
const MEMBERSHIP_ID = new ParseUUIDPipe({ exceptionFactory: () => new NotFoundException("Pengguna tidak ditemukan") });
const INVITATION_ID = new ParseUUIDPipe({ exceptionFactory: () => new NotFoundException("Undangan tidak ditemukan atau sudah diterima") });

// Pengguna & undangan usaha aktif (feature 08, /settings/users). Wewenang per peran dicek di service.
@Controller("users")
@Roles("owner", "admin")
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  async overview(@CurrentUser() user: AuthUser): Promise<ApiResponse<TenantUsersOverview>> {
    return { success: true, data: await this.usersService.overview(user) };
  }

  @Post("invitations")
  async invite(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(inviteUserSchema)) body: InviteUserInput): Promise<ApiResponse<null>> {
    await this.usersService.invite(user, body);
    return { success: true, data: null };
  }

  @Post("invitations/:id/resend")
  @HttpCode(HttpStatus.OK)
  async resendInvitation(@CurrentUser() user: AuthUser, @Param("id", INVITATION_ID) id: string): Promise<ApiResponse<null>> {
    await this.usersService.resendInvitation(user, id);
    return { success: true, data: null };
  }

  @Post("invitations/:id/cancel")
  @HttpCode(HttpStatus.OK)
  async cancelInvitation(@CurrentUser() user: AuthUser, @Param("id", INVITATION_ID) id: string): Promise<ApiResponse<null>> {
    await this.usersService.cancelInvitation(user, id);
    return { success: true, data: null };
  }

  @Post(":membershipId/role")
  @HttpCode(HttpStatus.OK)
  async changeRole(
    @CurrentUser() user: AuthUser,
    @Param("membershipId", MEMBERSHIP_ID) membershipId: string,
    @Body(new ZodValidationPipe(changeMemberRoleSchema)) body: ChangeMemberRoleInput,
  ): Promise<ApiResponse<null>> {
    await this.usersService.changeRole(user, membershipId, body.role);
    return { success: true, data: null };
  }

  @Post(":membershipId/revoke")
  @HttpCode(HttpStatus.OK)
  async revoke(@CurrentUser() user: AuthUser, @Param("membershipId", MEMBERSHIP_ID) membershipId: string): Promise<ApiResponse<null>> {
    await this.usersService.revoke(user, membershipId);
    return { success: true, data: null };
  }
}

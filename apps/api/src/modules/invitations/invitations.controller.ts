import {
  type AcceptInvitationInput,
  acceptInvitationSchema,
  type ApiResponse,
  type InvitationPreview,
  type InvitationTokenInput,
  invitationTokenSchema,
} from "@exapay/shared";
import { Body, Controller, HttpCode, HttpStatus, Post } from "@nestjs/common";

import { Public } from "../../common/auth/public.decorator.js";
import { ZodValidationPipe } from "../../common/validation/zod-validation.pipe.js";
import { InvitationsService } from "./invitations.service.js";

// Dibuka dari tautan email tanpa login. Token lewat body (bukan URL) agar tidak tercatat di log akses API.
@Controller("invitations")
export class InvitationsController {
  constructor(private readonly invitationsService: InvitationsService) {}

  // 410 jika tautan tidak valid / sudah dipakai
  @Public()
  @Post("lookup")
  @HttpCode(HttpStatus.OK)
  async lookup(@Body(new ZodValidationPipe(invitationTokenSchema)) body: InvitationTokenInput): Promise<ApiResponse<InvitationPreview>> {
    return { success: true, data: await this.invitationsService.preview(body.token) };
  }

  // 410 jika tautan tidak valid / kedaluwarsa. Sesi tidak dibuat: masuk lewat /login.
  @Public()
  @Post("accept")
  @HttpCode(HttpStatus.OK)
  async accept(@Body(new ZodValidationPipe(acceptInvitationSchema)) body: AcceptInvitationInput): Promise<ApiResponse<null>> {
    await this.invitationsService.accept(body);
    return { success: true, data: null };
  }
}

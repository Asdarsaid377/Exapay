import {
  type ApiResponse,
  type AuthClient,
  type AuthResult,
  type AuthSession,
  type ForgotPasswordInput,
  forgotPasswordSchema,
  type LoginInput,
  loginSchema,
  type RefreshInput,
  refreshSchema,
  type ResetPasswordInput,
  resetPasswordSchema,
  type SwitchTenantInput,
  switchTenantSchema,
} from "@exapay/shared";
import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, Res, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { CookieOptions, Request, Response } from "express";

import { ACCESS_COOKIE, type AuthUser, readCookie, REFRESH_COOKIE } from "../../common/auth/auth-user.js";
import { CurrentUser } from "../../common/auth/current-user.decorator.js";
import { Public } from "../../common/auth/public.decorator.js";
import type { Env } from "../../common/config/env.js";
import { ZodValidationPipe } from "../../common/validation/zod-validation.pipe.js";
import { ACCESS_TOKEN_TTL_SECONDS, AuthService, type IssuedSession, REFRESH_TOKEN_TTL_SECONDS } from "./auth.service.js";
import { PasswordResetService } from "./password-reset.service.js";

@Controller("auth")
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly passwordResetService: PasswordResetService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  @Public()
  @Post("login")
  @HttpCode(HttpStatus.OK)
  async login(
    @Body(new ZodValidationPipe(loginSchema)) body: LoginInput,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ApiResponse<AuthResult>> {
    const issued = await this.authService.login(body);
    return { success: true, data: this.deliver(res, issued, body.client) };
  }

  @Public()
  @Post("refresh")
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Body(new ZodValidationPipe(refreshSchema)) body: RefreshInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ApiResponse<AuthResult>> {
    const issued = await this.authService.refresh(this.refreshTokenFrom(req, body));
    return { success: true, data: this.deliver(res, issued, body.client) };
  }

  @Post("switch-tenant")
  @HttpCode(HttpStatus.OK)
  async switchTenant(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(switchTenantSchema)) body: SwitchTenantInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ApiResponse<AuthResult>> {
    const issued = await this.authService.switchTenant(user, this.refreshTokenFrom(req, body), body.tenantId);
    return { success: true, data: this.deliver(res, issued, body.client) };
  }

  // Publik: logout harus tetap bisa walau access token sudah kedaluwarsa
  @Public()
  @Post("logout")
  @HttpCode(HttpStatus.OK)
  async logout(
    @Body(new ZodValidationPipe(refreshSchema)) body: RefreshInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ApiResponse<null>> {
    const token = body.refreshToken ?? readCookie(req, REFRESH_COOKIE);
    if (token) await this.authService.logout(token);
    res.clearCookie(ACCESS_COOKIE, this.cookieOptions());
    res.clearCookie(REFRESH_COOKIE, this.cookieOptions());
    return { success: true, data: null };
  }

  // Selalu sukses (tidak membocorkan apakah email terdaftar)
  @Public()
  @Post("forgot-password")
  @HttpCode(HttpStatus.OK)
  async forgotPassword(@Body(new ZodValidationPipe(forgotPasswordSchema)) body: ForgotPasswordInput): Promise<ApiResponse<null>> {
    await this.passwordResetService.request(body.email);
    return { success: true, data: null };
  }

  // 410 jika tautan tidak valid/kedaluwarsa/sudah dipakai
  @Public()
  @Post("reset-password")
  @HttpCode(HttpStatus.OK)
  async resetPassword(@Body(new ZodValidationPipe(resetPasswordSchema)) body: ResetPasswordInput): Promise<ApiResponse<null>> {
    await this.passwordResetService.reset(body.token, body.password);
    return { success: true, data: null };
  }

  @Get("me")
  async me(@CurrentUser() user: AuthUser): Promise<ApiResponse<AuthSession>> {
    return { success: true, data: await this.authService.getSession(user) };
  }

  private refreshTokenFrom(req: Request, body: RefreshInput): string {
    const token = body.refreshToken ?? readCookie(req, REFRESH_COOKIE);
    if (!token) throw new UnauthorizedException("Sesi berakhir, silakan login kembali");
    return token;
  }

  // Web: token hanya di cookie httpOnly. Mobile: token di body, tanpa cookie.
  private deliver(res: Response, issued: IssuedSession, client: AuthClient): AuthResult {
    if (client === "mobile") return { ...issued.session, tokens: issued.tokens };

    res.cookie(ACCESS_COOKIE, issued.tokens.accessToken, { ...this.cookieOptions(), maxAge: ACCESS_TOKEN_TTL_SECONDS * 1000 });
    res.cookie(REFRESH_COOKIE, issued.tokens.refreshToken, { ...this.cookieOptions(), maxAge: REFRESH_TOKEN_TTL_SECONDS * 1000 });
    return issued.session;
  }

  private cookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      secure: this.config.get("NODE_ENV", { infer: true }) === "production",
      sameSite: "lax",
      path: "/",
    };
  }
}

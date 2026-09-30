import { API_ERROR_CODES, type ApiErrorCode, type ApiResponse } from "@exapay/shared";
import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException, HttpStatus, Logger } from "@nestjs/common";
import type { Response } from "express";

// Semua error keluar dalam bentuk { success: false, error }. Detail hanya di log server.
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const code = this.codeOf(exception);
      const body: ApiResponse<never> = { success: false, error: this.messageOf(exception), ...(code ? { code } : {}) };
      response.status(status).json(body);
      return;
    }

    this.logger.error(
      `[http/unhandled] ${exception instanceof Error ? exception.message : String(exception)}`,
      exception instanceof Error ? exception.stack : undefined,
    );
    const body: ApiResponse<never> = { success: false, error: "Terjadi kesalahan pada server. Silakan coba lagi." };
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json(body);
  }

  // Kode error opsional: throw new ForbiddenException({ message, code: "TENANT_DEACTIVATED" })
  private codeOf(exception: HttpException): ApiErrorCode | null {
    const payload: unknown = exception.getResponse();
    if (typeof payload !== "object" || payload === null) return null;
    const code: unknown = Reflect.get(payload, "code");
    return API_ERROR_CODES.find((known) => known === code) ?? null;
  }

  // Pesan HttpException buatan kita sudah human-readable; pesan bawaan Nest (mis. 404) diganti
  private messageOf(exception: HttpException): string {
    // Route tidak ada: pesan bawaan Nest "Cannot GET /path" (berbahasa Inggris, membocorkan path)
    if (exception.getStatus() === HttpStatus.NOT_FOUND && /^Cannot [A-Z]+ /.test(exception.message)) return "Halaman atau data tidak ditemukan";
    return exception.message;
  }
}

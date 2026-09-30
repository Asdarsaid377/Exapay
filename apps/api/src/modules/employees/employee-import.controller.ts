import { type ApiResponse, EMPLOYEE_IMPORT_MAX_BYTES, type EmployeeImportPreview, type EmployeeImportResult } from "@exapay/shared";
import { BadRequestException, Controller, Get, HttpCode, HttpStatus, Post, StreamableFile, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";

import type { AuthUser } from "../../common/auth/auth-user.js";
import { CurrentUser } from "../../common/auth/current-user.decorator.js";
import { Roles } from "../../common/auth/roles.decorator.js";
import { EmployeeImportService } from "./employee-import.service.js";

const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

// Bagian file multipart yang dipakai (multer memory storage)
type UploadedExcel = { buffer: Buffer; size: number };

// File disimpan di memori (bukan disk/S3) — hanya dibaca lalu dibuang; batas ukuran di multer (413)
const upload = FileInterceptor("file", { limits: { fileSize: EMPLOYEE_IMPORT_MAX_BYTES, files: 1 } });

function bufferOf(file: UploadedExcel | undefined): Buffer {
  if (!file || file.size === 0) throw new BadRequestException("Pilih file Excel (.xlsx) untuk diunggah");
  return file.buffer;
}

// Impor karyawan dari Excel (feature 12) — owner/admin (peran dibaca ulang dari DB di service).
// Didaftarkan sebelum EmployeesController agar /employees/import tidak tertangkap route /employees/:id.
@Controller("employees/import")
export class EmployeeImportController {
  constructor(private readonly importService: EmployeeImportService) {}

  @Get("template")
  @Roles("owner", "admin")
  async template(@CurrentUser() user: AuthUser): Promise<StreamableFile> {
    const buffer = await this.importService.template(user);
    return new StreamableFile(buffer, { type: XLSX_TYPE, disposition: 'attachment; filename="template-impor-karyawan.xlsx"' });
  }

  @Post("preview")
  @Roles("owner", "admin")
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(upload)
  async preview(@CurrentUser() user: AuthUser, @UploadedFile() file: UploadedExcel | undefined): Promise<ApiResponse<EmployeeImportPreview>> {
    return { success: true, data: await this.importService.preview(user, bufferOf(file)) };
  }

  @Post()
  @Roles("owner", "admin")
  @UseInterceptors(upload)
  async commit(@CurrentUser() user: AuthUser, @UploadedFile() file: UploadedExcel | undefined): Promise<ApiResponse<EmployeeImportResult>> {
    return { success: true, data: await this.importService.commit(user, bufferOf(file)) };
  }
}

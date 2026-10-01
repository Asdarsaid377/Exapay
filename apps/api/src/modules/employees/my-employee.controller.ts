import { type ApiResponse, MEMBERSHIP_ROLES, type MyProfile } from "@exapay/shared";
import { Controller, Get } from "@nestjs/common";

import type { AuthUser } from "../../common/auth/auth-user.js";
import { CurrentUser } from "../../common/auth/current-user.decorator.js";
import { Roles } from "../../common/auth/roles.decorator.js";
import { EmployeesService } from "./employees.service.js";

// Data karyawan milik sendiri (portal /me/profile, feature 37). Semua peran; hanya baca.
@Controller("employees/me")
@Roles(...MEMBERSHIP_ROLES)
export class MyEmployeeController {
  constructor(private readonly employeesService: EmployeesService) {}

  @Get()
  async profile(@CurrentUser() user: AuthUser): Promise<ApiResponse<MyProfile>> {
    return { success: true, data: await this.employeesService.myProfile(user) };
  }
}

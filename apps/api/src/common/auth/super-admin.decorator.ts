import { SetMetadata } from "@nestjs/common";

export const SUPER_ADMIN_KEY = "superAdmin";

// Endpoint panel super-admin (/admin). Dicek RolesGuard dari klaim token; service tetap memeriksa flag di database
// (current_app_is_super_admin) karena klaim bisa basi hingga 15 menit.
export const SuperAdmin = (): MethodDecorator & ClassDecorator => SetMetadata(SUPER_ADMIN_KEY, true);
